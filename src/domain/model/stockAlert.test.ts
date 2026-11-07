import { describe, expect, it } from 'vitest'

import { newStockAlertIds, stockAlertsFromPayload, type StockAlert } from './stockAlert'

const row = {
  itemId: 'item-1',
  itemName: 'Cinta de señalización',
  unit: 'UNITS',
  threshold: 5,
  vehicleId: 'veh-1',
  plate: 'ABC123',
  kitLineId: 'line-1',
  quantity: 3,
}

function alert(kitLineId: string): StockAlert {
  return {
    itemId: 'item',
    itemName: 'Cinta',
    unit: 'UNITS',
    threshold: 5,
    vehicleId: 'veh',
    plate: 'ABC123',
    kitLineId,
    quantity: 1,
  }
}

describe('newStockAlertIds', () => {
  it('no suena con la primera foto', () => {
    expect(newStockAlertIds(null, [alert('a')])).toEqual([])
  })

  it('devuelve solo las líneas que no estaban', () => {
    expect(newStockAlertIds(new Set(['a']), [alert('a'), alert('b')])).toEqual(['b'])
    expect(newStockAlertIds(new Set(['a']), [alert('a')])).toEqual([])
  })
})

describe('stockAlertsFromPayload', () => {
  it('lee el snapshot completo', () => {
    expect(stockAlertsFromPayload({ alerts: [row] })).toEqual([
      {
        itemId: 'item-1',
        itemName: 'Cinta de señalización',
        unit: 'UNITS',
        threshold: 5,
        vehicleId: 'veh-1',
        plate: 'ABC123',
        kitLineId: 'line-1',
        quantity: 3,
      },
    ])
  })

  it('acepta umbral cero y una lista vacía', () => {
    expect(stockAlertsFromPayload({ alerts: [{ ...row, threshold: 0, quantity: 0 }] })).toHaveLength(1)
    expect(stockAlertsFromPayload({ alerts: [] })).toEqual([])
  })

  it('omite una fila rota y conserva el orden', () => {
    const parsed = stockAlertsFromPayload({
      alerts: [{ ...row, plate: '' }, { ...row, kitLineId: 'line-2', itemName: 'Cono' }],
    })
    expect(parsed?.map((alert) => alert.itemName)).toEqual(['Cono'])
  })

  it('rechaza un cuerpo que no es snapshot', () => {
    expect(stockAlertsFromPayload(null)).toBeNull()
    expect(stockAlertsFromPayload({})).toBeNull()
    expect(stockAlertsFromPayload({ alerts: null })).toBeNull()
  })

  it('descarta umbral negativo sin tratarlo como lista vacía', () => {
    expect(stockAlertsFromPayload({ alerts: [{ ...row, threshold: -1 }] })).toBeNull()
    expect(stockAlertsFromPayload({ alerts: [{ ...row, unit: 'LITERS' }] })?.[0]?.unit).toBe('UNITS')
  })

  it('lee el snapshot con los nombres que serializa Go sin etiquetas', () => {
    expect(
      stockAlertsFromPayload({
        alerts: [
          {
            ItemID: 'item-1',
            ItemName: 'Cable 3x16',
            Unit: 'METERS',
            Threshold: 50,
            VehicleID: 'veh-1',
            Plate: 'LSY026',
            KitLineID: 'line-1',
            Quantity: 20,
          },
        ],
      }),
    ).toEqual([
      {
        itemId: 'item-1',
        itemName: 'Cable 3x16',
        unit: 'METERS',
        threshold: 50,
        vehicleId: 'veh-1',
        plate: 'LSY026',
        kitLineId: 'line-1',
        quantity: 20,
      },
    ])
  })
})
