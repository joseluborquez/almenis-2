import type { AtencionAnonimizada } from '../types'
import { hoyChile } from './fechas'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type ColName = 'hora' | 'rut' | 'nombre' | 'tratamiento' | 'comentario' | 'estado' | 'contacto' | 'ficha' | 'profesional'
type ColBounds = Record<ColName, { min: number; max: number }>

// Textos exactos de los headers del PDF de Reservo y su columna correspondiente
const HEADER_MAP: Array<[string, ColName]> = [
  ['Hora',                      'hora'],
  ['RUT',                       'rut'],
  ['Nombre',                    'nombre'],
  ['Descripción/Tratamiento',   'tratamiento'],
  ['Comentario',                'comentario'],
  ['Estado',                    'estado'],
  ['Contacto',                  'contacto'],
  ['Ficha',                     'ficha'],
  ['Box/Prof',                  'profesional'],
]

const ESTADOS_VALIDOS = new Set([
  'Atendido', 'Suspendió', 'Llegó', 'En atención',
  'Confirmado', 'No Confirmado', 'No llegó',
])

const HEADER_TEXTOS = new Set([
  'Hora', 'RUT', 'Nombre', 'Descripción/Tratamiento',
  'Comentario', 'Estado', 'Contacto', 'Ficha', 'Box/Prof',
  'Hoja de Estadística Diaria', 'Fecha:',
])

// Detecta los límites de columna leyendo las posiciones X de la fila de headers
// del PDF. Funciona independientemente del zoom o layout del computador que exportó.
function detectarColumnas(items: Array<{ x: number; str: string }>): ColBounds {
  const encontradas: Array<{ col: ColName; x: number }> = []

  for (const [texto, col] of HEADER_MAP) {
    const item = items.find(i => i.str.trim() === texto)
    if (item) encontradas.push({ col, x: item.x })
  }

  // Mínimo necesario: tratamiento, estado y profesional. Sin los headers no se
  // puede saber dónde está cada columna: adivinar con posiciones fijas arriesga
  // que el nombre del paciente caiga en el rango de "tratamiento" y salga del
  // computador, así que se aborta en vez de usar un fallback.
  const cols = new Set(encontradas.map(e => e.col))
  if (!cols.has('tratamiento') || !cols.has('estado') || !cols.has('profesional')) {
    throw new Error(
      'No se reconoce el formato del PDF: no se encontraron los encabezados de Reservo ' +
      '(Descripción/Tratamiento, Estado, Box/Prof). Verifica que sea la Hoja de ' +
      'Estadística Diaria exportada desde Reservo.'
    )
  }

  encontradas.sort((a, b) => a.x - b.x)

  const bounds = {} as ColBounds
  for (let i = 0; i < encontradas.length; i++) {
    const { col, x } = encontradas[i]
    const min = i === 0 ? 0 : x - 4
    const max = i + 1 < encontradas.length ? encontradas[i + 1].x - 4 : 9999
    bounds[col] = { min, max }
  }

  // Rellenar columnas no encontradas con un rango vacío para evitar errores
  for (const [, col] of HEADER_MAP) {
    if (!bounds[col]) bounds[col] = { min: -1, max: -1 }
  }

  return bounds
}

function detectarColumna(x: number, bounds: ColBounds): ColName | null {
  for (const [col, b] of Object.entries(bounds) as Array<[ColName, { min: number; max: number }]>) {
    if (x >= b.min && x < b.max) return col
  }
  return null
}

interface FilaRaw {
  y: number
  maxY: number
  celdas: Partial<Record<ColName, string>>
}

// Líneas dentro de una celda con wrap están ~11-14px separadas; filas distintas ≥19px
const Y_TOLERANCE = 15

function agruparPorFila(items: Array<{ x: number; y: number; str: string }>, bounds: ColBounds): FilaRaw[] {
  const sorted = [...items].sort((a, b) => a.y - b.y)
  const filas: FilaRaw[] = []

  for (const item of sorted) {
    const texto = item.str.trim()
    if (!texto) continue

    const col = detectarColumna(item.x, bounds)
    if (!col) continue

    const fila = filas.find(f => Math.abs(f.maxY - item.y) <= Y_TOLERANCE)

    if (!fila) {
      filas.push({ y: item.y, maxY: item.y, celdas: { [col]: texto } })
    } else {
      if (item.y > fila.maxY) fila.maxY = item.y
      const prev = fila.celdas[col] || ''
      fila.celdas[col] = prev ? `${prev} ${texto}` : texto
    }
  }

  return filas.sort((a, b) => a.y - b.y)
}

function limpiarTratamiento(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

function esHeaderOMetadata(fila: FilaRaw): boolean {
  const textos = Object.values(fila.celdas).join(' ')
  for (const h of HEADER_TEXTOS) {
    if (textos.includes(h)) return true
  }
  return false
}

export async function parsearPDF(file: File): Promise<{ atenciones: AtencionAnonimizada[]; fecha: string }> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const todosLosItems: Array<{ x: number; y: number; str: string }> = []
  let fechaDetectada = hoyChile()

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent()

    for (const item of textContent.items) {
      if (!('str' in item)) continue
      const tx = item.transform
      const x = tx[4]
      const y = viewport.height - tx[5]
      const pageY = (pageNum - 1) * viewport.height + y
      const texto = item.str.trim()

      if (texto.startsWith('Fecha:')) {
        const iso = texto.match(/(\d{4})-(\d{2})-(\d{2})/)
        const latino = texto.match(/(\d{2})[-/](\d{2})[-/](\d{4})/)
        if (iso) fechaDetectada = `${iso[1]}-${iso[2]}-${iso[3]}`
        else if (latino) fechaDetectada = `${latino[3]}-${latino[2]}-${latino[1]}`
      }

      todosLosItems.push({ x, y: pageY, str: texto })
    }
  }

  // Detectar posiciones de columnas desde los headers del PDF
  const bounds = detectarColumnas(todosLosItems)

  const filas = agruparPorFila(todosLosItems, bounds)
  const atenciones: AtencionAnonimizada[] = []

  for (const fila of filas) {
    if (esHeaderOMetadata(fila)) continue

    const estado = fila.celdas.estado?.trim() || ''
    const profesional = fila.celdas.profesional?.trim() || ''
    const tratamientoRaw = fila.celdas.tratamiento?.trim() || ''
    const hora = fila.celdas.hora?.trim() || ''

    if (!ESTADOS_VALIDOS.has(estado)) continue
    if (!tratamientoRaw || !profesional) continue

    atenciones.push({
      hora,
      tratamiento: limpiarTratamiento(tratamientoRaw),
      estado,
      profesional,
      // RUT, Nombre, Contacto, Ficha: NUNCA se incluyen
    })
  }

  return { atenciones, fecha: fechaDetectada }
}
