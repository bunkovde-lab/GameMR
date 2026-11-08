import { Icon } from '../Icon';

interface Props {
  leftPanelOpen: boolean;
  onOpenLeftPanel: () => void;
}

/**
 * Область карты занимает всю рабочую зону; панели лежат поверх неё.
 * Поэтому открытие и закрытие панелей не меняет размер карты (ТЗ §3.1: «без скачка точек»).
 * Утверждённый арт и геометрия W3 подключаются на этапе W3.
 */
export function MapStage({ leftPanelOpen, onOpenLeftPanel }: Props) {
  return (
    <section className="map-stage" aria-label="Карта города" data-testid="map-stage">
      {!leftPanelOpen && (
        <div className="map-tools">
          <button className="btn" onClick={onOpenLeftPanel} aria-controls="incident-panel" aria-expanded={false}>
            <Icon name="list" /> Вызовы
          </button>
        </div>
      )}
      <div className="map-placeholder">
        <b>КАРВЕН · ГОРОД ПРЕЕМСТВА</b>
        Здесь будет утверждённая карта города с шестью районами.
        <br />
        Подключение — этап W3.
      </div>
    </section>
  );
}
