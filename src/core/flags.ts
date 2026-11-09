import type { GameState } from './types';

/** W9: нейтральные событийные флаги кампании (сценарий §9). Не показываются игроку как «очки». */
export const hasFlag = (s: GameState, f: string) => s.campaign.flags.includes(f);
export function setFlag(s: GameState, f: string | undefined) {
  if (f && !s.campaign.flags.includes(f)) s.campaign.flags.push(f);
}
export const initialCampaign = (): GameState['campaign'] => ({ flags: [], choices: {}, ops: [], ending: null, endingSeen: false });
