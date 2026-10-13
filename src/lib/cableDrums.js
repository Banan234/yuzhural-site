import reference from '../../data/cableDrumReference.json';

export const CABLE_DRUMS = reference.drums;
export const CABLE_DRUM_SOURCE = reference.source;

export function getCableDrum(material, number) {
  return (
    CABLE_DRUMS.find(
      (drum) => drum.material === material && drum.number === number
    ) || null
  );
}
