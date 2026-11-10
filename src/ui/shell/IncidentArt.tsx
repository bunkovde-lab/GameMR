import type { CSSProperties } from 'react';
import { templateById } from '../../core/events';
import type { Incident, IncidentState } from '../../core/types';
import { artUrl, stampUrl, aftermathIconUrl } from '../art';
import { Icon, type IconName } from '../Icon';
import { INCIDENT_STATE_LABEL } from '../labels';
import { INCIDENT_MARKER } from '../map/entities';

/**
 * ART-023: арты карточки происшествия. Код знает только ключи файлов; как только файл появится
 * в assets/, он подхватится сборкой без правки кода. Порядок поиска иллюстрации:
 *   inc_<id шаблона> → сцена события ART-015 (поле scene) → inc_type_<тип угрозы> → заглушка.
 */
const TYPE_BY_MARKER: Record<string, string> = {
  marker_incident_riot: 'riot', marker_incident_bio: 'bio', marker_incident_armed: 'armed',
  marker_incident_search: 'search', marker_incident_illegal_mod: 'illegal_mod',
};
const TYPE_LABEL: Record<string, string> = {
  riot: 'беспорядки', bio: 'биоугроза', armed: 'вооружённая угроза', search: 'розыск', illegal_mod: 'нелегальная модификация',
};

export function incidentArtKeys(templateId: string): string[] {
  const t = templateById(templateId);
  const type = TYPE_BY_MARKER[INCIDENT_MARKER[templateId] ?? ''] ?? 'search';
  return [`inc_${templateId}`, ...(t?.scene ? [t.scene] : []), `inc_type_${type}`];
}

export function incidentTypeLabel(templateId: string): string {
  return TYPE_LABEL[TYPE_BY_MARKER[INCIDENT_MARKER[templateId] ?? ''] ?? 'search']!;
}

/** Итоговые состояния получают штамп поверх иллюстрации. */
const STAMP: Partial<Record<IncidentState, { key: string; tone: 'good' | 'mid' | 'bad' | 'dim' }>> = {
  resolved_success: { key: 'closed', tone: 'good' },
  resolved_partial: { key: 'partial', tone: 'mid' },
  failed: { key: 'failed', tone: 'bad' },
  expired: { key: 'expired', tone: 'dim' },
};

export function StatusStamp({ state }: { state: IncidentState }) {
  const s = STAMP[state];
  if (!s) return null;
  const url = stampUrl(`stamp_${s.key}`);
  const label = INCIDENT_STATE_LABEL[state];
  return url ? (
    <span className={`inc-stamp has-art tone-${s.tone}`} role="img" aria-label={`Штамп: ${label}`} data-testid="inc-stamp" data-stamp={s.key}
      style={{ maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` }} />
  ) : (
    <span className={`inc-stamp tone-${s.tone}`} data-testid="inc-stamp" data-stamp={s.key}>{label}</span>
  );
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** Шапка карточки: иллюстрация происшествия и штамп итога. */
export function IncidentHero({ inc }: { inc: Incident }) {
  const keys = incidentArtKeys(inc.templateId);
  const key = keys.find((k) => artUrl(k)) ?? keys[keys.length - 1]!;
  const url = artUrl(key);
  const label = `Иллюстрация: ${inc.title}`;
  return (
    <div className={`inc-hero${url ? ' has-art' : ' placeholder'}`} role="img" aria-label={label}
      style={url ? { backgroundImage: `url(${url})` } : undefined} data-testid="inc-hero" data-art={key}>
      {!url && <span className="inc-hero-type"><Icon name="eye" /> {cap(incidentTypeLabel(inc.templateId))}<small>иллюстрация ожидается</small></span>}
      <StatusStamp state={inc.state} />
    </div>
  );
}

/** Строки «что на кону»: «Люди: …», «Право: …» получают значок категории. */
const CATEGORY: Record<string, { key: string; icon: IconName }> = {
  'Люди': { key: 'people', icon: 'users' },
  'Город': { key: 'city', icon: 'map' },
  'Право': { key: 'law', icon: 'scales' },
  'Политика': { key: 'politics', icon: 'briefcase' },
  'Кадры': { key: 'staff', icon: 'person' },
  'Наука': { key: 'science', icon: 'beaker' },
};

export function AftermathList({ items }: { items: string[] }) {
  return (
    <ul className="aftermath-list" data-testid="aftermath-list">
      {items.map((x) => {
        const m = /^([А-ЯЁ][а-яё]+):\s*(.*)$/.exec(x);
        const cat = m ? CATEGORY[m[1]!] : undefined;
        if (!m || !cat) return <li key={x}><span className="aft-ico" />{x}</li>;
        const url = aftermathIconUrl(`aft_${cat.key}`);
        return (
          <li key={x} data-cat={cat.key}>
            {url
              ? <span className={`aft-ico mk-icon cat-${cat.key}`} aria-hidden="true" style={{ maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` }} />
              : <span className={`aft-ico cat-${cat.key}`} aria-hidden="true"><Icon name={cat.icon} /></span>}
            <span><b>{m[1]}:</b> {m[2]}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** ART-023 (по желанию): фон карточки assets/backgrounds/incident_card_bg.png. Без него внизу виден бледный герб Дирекции. */
export function incidentCardBg(): CSSProperties | undefined {
  const url = artUrl('incident_card_bg');
  return url ? ({ '--inc-card-bg': `url(${url})` } as CSSProperties) : undefined;
}
