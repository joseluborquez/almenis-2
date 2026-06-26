import type { AtencionAnonimizada } from '../types'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Columnas del PDF de Reservo (posiciones X aproximadas detectadas del PDF real)
// Hora | RUT | Nombre | Descripción | Comentario | Estado | Contacto | Ficha | Box/Prof
const COL_BOUNDARIES = {
  hora:        { min: 0,   max: 85  },
  rut:         { min: 85,  max: 145 },
  nombre:      { min: 145, max: 225 },
  tratamiento: { min: 225, max: 345 },
  comentario:  { min: 345, max: 400 },
  estado:      { min: 400, max: 468 },
  contacto:    { min: 468, max: 575 },
  ficha:       { min: 575, max: 648 },
  profesional: { min: 648, max: 900 },
}

const ESTADOS_VALIDOS = new Set([
  'Atendido', 'Suspendió', 'Llegó', 'En atención',
  'Confirmado', 'No Confirmado', 'No llegó',
])

const HEADER_TEXTOS = new Set([
  'Hora', 'RUT', 'Nombre', 'Descripción/Tratamiento',
  'Comentario', 'Estado', 'Contacto', 'Ficha', 'Box/Prof',
  'Hoja de Estadística Diaria', 'Fecha:',
])

function detectarColumna(x: number): keyof typeof COL_BOUNDARIES | null {
  for (const [col, bounds] of Object.entries(COL_BOUNDARIES)) {
    if (x >= bounds.min && x < bounds.max) {
      return col as keyof typeof COL_BOUNDARIES
    }
  }
  return null
}

interface FilaRaw {
  y: number
  celdas: Partial<Record<keyof typeof COL_BOUNDARIES, string>>
}

function agruparPorFila(items: Array<{ x: number; y: number; str: string }>): FilaRaw[] {
  const filaMap = new Map<number, FilaRaw>()
  const Y_TOLERANCE = 4

  for (const item of items) {
    const texto = item.str.trim()
    if (!texto) continue

    const col = detectarColumna(item.x)
    if (!col) continue

    // buscar fila existente cercana en Y
    let filaY: number | null = null
    for (const y of filaMap.keys()) {
      if (Math.abs(y - item.y) <= Y_TOLERANCE) {
        filaY = y
        break
      }
    }

    if (filaY === null) {
      filaY = item.y
      filaMap.set(filaY, { y: filaY, celdas: {} })
    }

    const fila = filaMap.get(filaY)!
    const prev = fila.celdas[col] || ''
    fila.celdas[col] = prev ? `${prev} ${texto}` : texto
  }

  return Array.from(filaMap.values()).sort((a, b) => b.y - a.y) // PDF Y crece hacia abajo
}

function limpiarTratamientos(raw: string): string[] {
  // Separar tratamientos duplicados en la misma celda: "A Fonasa, A Fonasa" → ["A Fonasa", "A Fonasa"]
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0)
}

function esHeaderOMetadata(fila: FilaRaw): boolean {
  const textos = Object.values(fila.celdas).join(' ')
  for (const h of HEADER_TEXTOS) {
    if (textos.includes(h)) return true
  }
  return false
}

export async function parsearPDF(file: File): Promise<{ atenciones: AtencionAnonimizada[]; fecha: string }> {
  // Cargar PDF.js dinámicamente para no bloquear el bundle inicial
  const pdfjsLib = await import('pdfjs-dist')

  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const todosLosItems: Array<{ x: number; y: number; str: string; pageY: number }> = []
  let fechaDetectada = new Date().toISOString().split('T')[0]

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent()

    for (const item of textContent.items) {
      if (!('str' in item)) continue
      const tx = item.transform
      const x = tx[4]
      const y = viewport.height - tx[5] // convertir coordenada PDF a top-down
      const pageY = (pageNum - 1) * viewport.height + y

      const texto = item.str.trim()

      // Detectar fecha del encabezado
      if (texto.startsWith('Fecha:')) {
        const match = texto.match(/(\d{4}-\d{2}-\d{2})/)
        if (match) fechaDetectada = match[1]
      }

      todosLosItems.push({ x, y: pageY, str: texto, pageY })
    }
  }

  const filas = agruparPorFila(todosLosItems)
  const atenciones: AtencionAnonimizada[] = []

  for (const fila of filas) {
    if (esHeaderOMetadata(fila)) continue

    const estado = fila.celdas.estado?.trim() || ''
    const profesional = fila.celdas.profesional?.trim() || ''
    const tratamientoRaw = fila.celdas.tratamiento?.trim() || ''
    const hora = fila.celdas.hora?.trim() || ''

    // Ignorar filas sin estado válido
    if (!ESTADOS_VALIDOS.has(estado)) continue

    // Ignorar filas sin tratamiento (Agenda Abierta, bloques vacíos)
    if (!tratamientoRaw || !profesional) continue

    // Separar múltiples tratamientos en una celda
    const tratamientos = limpiarTratamientos(tratamientoRaw)

    for (const tratamiento of tratamientos) {
      atenciones.push({
        hora,
        tratamiento,
        estado,
        profesional,
        // RUT, Nombre, Contacto, Ficha: NUNCA se incluyen
      })
    }
  }

  return { atenciones, fecha: fechaDetectada }
}
