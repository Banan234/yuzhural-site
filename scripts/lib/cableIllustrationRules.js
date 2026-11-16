import { createHash } from 'node:crypto';
import registry from '../../data/cableIllustrationRules.json' with { type: 'json' };
import { vvgCutQuality } from './cableVvgCutQuality.js';
import { deriveLayerContactRule } from './cableLayerContact.js';
import { deriveMulticoreComposition } from './cableMulticoreComposition.js';
import { deriveStrippingCompositionPreference, usesScreenedVvgStripping } from './cableStrippingComposition.js';

export const cableIllustrationRules = registry;
export const cableIllustrationRulesHash = createHash('sha256')
  .update(JSON.stringify(registry)).digest('hex');

const scopes = {
  all: () => true,
  pipeline: () => true,
  screen: context => context.technical.screen.present,
  fire: context => context.technical.fireBarrier,
  contact: context => context.contact.mode === 'CONFIRMED_DIRECT_CONTACT',
  multicore: context => Boolean(context.multicore),
  screenedVvg: context => context.screenedVvg,
  extended: context => Boolean(context.extended) && !context.screenedVvg,
  vvg: context => Boolean(context.cutQuality),
  vvgz: context => context.cutQuality?.mode === 'flush-filling',
};

export function selectCableIllustrationRules(profile, technical, { editTarget = false } = {}) {
  const context = {
    technical,
    screenedVvg: usesScreenedVvgStripping(profile),
    contact: deriveLayerContactRule(profile, technical),
    multicore: deriveMulticoreComposition(profile, { historicalTargetedEdit: editTarget }),
    extended: !editTarget && deriveStrippingCompositionPreference(profile),
    cutQuality: vvgCutQuality(profile, technical),
  };
  return registry.rules.filter(rule => scopes[rule.scope](context));
}

export function assertCableIllustrationPrompt(rules, prompt) {
  for (const rule of rules)
    if (rule.marker && !prompt.includes(rule.marker))
      throw Error('Mandatory cable rule missing from request: ' + rule.id);
}
