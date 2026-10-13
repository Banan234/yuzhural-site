import { describe, expect, it } from 'vitest';
import {
  estimateWoundLength,
  lengthFromNetMass,
  calculateShipment,
  estimateTransportFit,
} from './cableLogistics';

describe('cable length estimates', () => {
  it('sums one and several measured winding layers in metres', () => {
    const one = estimateWoundLength({
      cableDiameterMm: 20,
      coreDiameterMm: 500,
      windingDiameterMm: 540,
      widthMm: 500,
    });
    expect(one.layers).toBe(1);
    expect(one.turns).toBe(25);
    expect(one.lengthM).toBeCloseTo((25 * Math.PI * 520) / 1000);
    const many = estimateWoundLength({
      cableDiameterMm: 20,
      coreDiameterMm: 500,
      windingDiameterMm: 900,
      widthMm: 500,
    });
    expect(many.layers).toBe(10);
    expect(many.lengthM).toBeCloseTo(549.778714);
  });
  it('rejects invalid geometry and counts only complete layers and turns', () => {
    expect(
      estimateWoundLength({
        cableDiameterMm: 0,
        coreDiameterMm: 500,
        windingDiameterMm: 900,
        widthMm: 500,
      })
    ).toBeNull();
    expect(
      estimateWoundLength({
        cableDiameterMm: 20,
        coreDiameterMm: 900,
        windingDiameterMm: 500,
        widthMm: 500,
      })
    ).toBeNull();
    expect(
      estimateWoundLength({
        cableDiameterMm: 20,
        coreDiameterMm: 500,
        windingDiameterMm: 539,
        widthMm: 500,
      }).lengthM
    ).toBe(0);
    expect(
      estimateWoundLength({
        cableDiameterMm: 20,
        coreDiameterMm: 500,
        windingDiameterMm: 540,
        widthMm: 519,
      }).turns
    ).toBe(25);
    expect(lengthFromNetMass('12,5', 500)).toBe(25);
    expect(lengthFromNetMass(-10, 500)).toBeNull();
    expect(lengthFromNetMass(10, 0)).toBeNull();
    expect(lengthFromNetMass(1e308, 1e-300)).toBeNull();
  });
});
describe('shipment calculations', () => {
  const box = {
    lengthM: '1,2',
    widthM: 0.8,
    heightM: 1,
    massKg: 200,
    count: 4,
  };
  it('multiplies weight and bounding volume by the number of places', () => {
    const result = calculateShipment([box, { ...box, massKg: 20, count: 2 }]);
    expect(result.massKg).toBe(840);
    expect(result.count).toBe(6);
    expect(result.volumeM3).toBeCloseTo(5.76);
    expect(calculateShipment([{ ...box, count: 1.5 }])).toBeNull();
    expect(calculateShipment([{ ...box, heightM: '' }])).toBeNull();
  });
  it('checks mass, dimensions and a one-level row layout independently', () => {
    const shipment = calculateShipment([box]);
    const fit = estimateTransportFit(shipment, {
      lengthM: 3,
      widthM: 2,
      heightM: 2,
      payloadKg: 700,
    });
    expect(fit.fitsDimensions).toBe(true);
    expect(fit.fitsFloorArea).toBe(true);
    expect(fit.fitsMass).toBe(false);
    expect(fit.capacity).toBe(4);
    expect(fit.fitsGrid).toBe(true);
    const narrow = estimateTransportFit(shipment, {
      lengthM: 3,
      widthM: 0.5,
      heightM: 2,
      payloadKg: 1000,
    });
    expect(narrow.fitsDimensions).toBe(false);
    const tall = estimateTransportFit(shipment, {
      lengthM: 3,
      widthM: 2,
      heightM: 0.5,
      payloadKg: 1000,
    });
    expect(tall.fitsDimensions).toBe(false);
  });
  it('does not claim a layout for mixed places even when area and volume fit', () => {
    const mixed = calculateShipment([box, { ...box, widthM: 1, count: 1 }]);
    expect(
      estimateTransportFit(mixed, {
        lengthM: 6,
        widthM: 2,
        heightM: 2,
        payloadKg: 3000,
      }).capacity
    ).toBeNull();
    expect(
      estimateTransportFit(mixed, {
        lengthM: 'Infinity',
        widthM: 2,
        heightM: 2,
        payloadKg: 3000,
      })
    ).toBeNull();
  });
});
