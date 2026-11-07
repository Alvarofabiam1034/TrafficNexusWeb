import { TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useStockAlerts } from '@/application/stockAlerts'
import type { StockAlert } from '@/domain/model/stockAlert'
import { formatInventoryQuantity } from '@/domain/model/inventory'
import { formatPlate } from '@/domain/validation/crewValidator'
import { Button } from '@/presentation/components/Button'
import { Dialog } from '@/presentation/components/Dialog'
import { plural, unitShortLabel } from '@/presentation/i18n/labels'

import { routes } from './routes'

export function StockAlertsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { alerts, ready, failed, refresh } = useStockAlerts()

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open, refresh])

  const openLine = (alert: StockAlert) => {
    onClose()
    navigate(`${routes.vehicle(alert.vehicleId)}?line=${encodeURIComponent(alert.kitLineId)}`)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Stock bajo"
      icon={<TriangleAlert />}
      wide
      actions={
        <Button variant="text" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      {!ready && failed ? (
        <div className="stock-alerts__empty">
          <p>No se pudieron cargar las alertas.</p>
          <Button variant="tonal" onClick={() => void refresh()}>
            Reintentar
          </Button>
        </div>
      ) : alerts.length === 0 ? (
        <p className="dialog__text">Ningún consumible está en o bajo su umbral.</p>
      ) : (
        <ul className="stock-alerts">
          {alerts.map((alert) => (
            <li key={alert.kitLineId}>
              <button type="button" className="stock-alerts__row" onClick={() => openLine(alert)}>
                <span className="stock-alerts__plate">{formatPlate(alert.plate)}</span>
                <span className="stock-alerts__name">{alert.itemName}</span>
                <span className="stock-alerts__qty">
                  {formatInventoryQuantity(alert.quantity, alert.unit)}
                  <span className="stock-alerts__threshold">
                    {' '}
                    ≤ {alert.threshold} {unitShortLabel[alert.unit]}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {alerts.length > 0 ? (
        <p className="stock-alerts__count">{plural(alerts.length, 'alerta activa', 'alertas activas')}</p>
      ) : null}
    </Dialog>
  )
}
