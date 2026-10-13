// Геометрические оценки отделены от условий реальной погрузки и тарифа перевозчика.
export function positiveNumber(value, { zero = false } = {}) {
  if (String(value ?? '').trim() === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) && (zero ? number >= 0 : number > 0)
    ? number
    : null;
}
export function estimateWoundLength({
  cableDiameterMm,
  coreDiameterMm,
  windingDiameterMm,
  widthMm,
}) {
  const [d, core, winding, width] = [
    cableDiameterMm,
    coreDiameterMm,
    windingDiameterMm,
    widthMm,
  ].map((value) => positiveNumber(value));
  if (
    [d, core, winding, width].includes(null) ||
    winding < core ||
    Math.max(d, core, winding, width) > 100000
  )
    return null;
  const layers = Math.floor((winding - core) / (2 * d) + 1e-9);
  const turns = Math.floor(width / d + 1e-9);
  if (!Number.isSafeInteger(layers) || !Number.isSafeInteger(turns))
    return null;
  if (!layers || !turns) return { lengthM: 0, layers, turns };
  // Сумма длин витков по средним диаметрам слоёв при рядной плотной намотке.
  return {
    lengthM: (Math.PI * turns * (layers * core + d * layers * layers)) / 1000,
    layers,
    turns,
  };
}
export function lengthFromNetMass(netKg, massKgPerKm) {
  const net = positiveNumber(netKg);
  const perKm = positiveNumber(massKgPerKm);
  const length = net !== null && perKm !== null ? (net * 1000) / perKm : null;
  return length !== null && Number.isFinite(length) && length > 0
    ? length
    : null;
}
export function calculateShipment(packages) {
  if (!Array.isArray(packages) || !packages.length) return null;
  let massKg = 0,
    volumeM3 = 0,
    count = 0;
  const places = [];
  for (const item of packages) {
    const [length, width, height, mass] = [
      item.lengthM,
      item.widthM,
      item.heightM,
      item.massKg,
    ].map((value) => positiveNumber(value));
    const quantity = positiveNumber(item.count);
    if (
      [length, width, height, mass, quantity].includes(null) ||
      !Number.isInteger(quantity) ||
      quantity > 10000 ||
      Math.max(length, width, height) > 100 ||
      mass > 1000000
    )
      return null;
    count += quantity;
    massKg += mass * quantity;
    volumeM3 += length * width * height * quantity;
    if (!Number.isFinite(massKg) || !Number.isFinite(volumeM3) || volumeM3 <= 0)
      return null;
    places.push({
      ...item,
      lengthM: length,
      widthM: width,
      heightM: height,
      massKg: mass,
      count: quantity,
    });
  }
  return { massKg, volumeM3, count, places };
}
export function estimateTransportFit(shipment, transport) {
  const [length, width, height, payload] = [
    transport.lengthM,
    transport.widthM,
    transport.heightM,
    transport.payloadKg,
  ].map((value) => positiveNumber(value));
  if (
    !shipment ||
    [length, width, height, payload].includes(null) ||
    Math.max(length, width, height) > 100 ||
    payload > 1000000
  )
    return null;
  // Поворот в плане разрешён. Высота сохраняется: барабаны не переворачиваем и не штабелируем.
  const fitsDimensions = shipment.places.every(
    (item) =>
      item.heightM <= height &&
      ((item.lengthM <= length && item.widthM <= width) ||
        (item.widthM <= length && item.lengthM <= width))
  );
  const floorArea = shipment.places.reduce(
    (sum, item) => sum + item.lengthM * item.widthM * item.count,
    0
  );
  const fitsMass = shipment.massKg <= payload;
  const fitsFloorArea = floorArea <= length * width;
  // Рядная раскладка рассчитывается только для одинаковых грузовых мест.
  const first = shipment.places[0];
  const homogeneous = shipment.places.every(
    (item) =>
      item.lengthM === first.lengthM &&
      item.widthM === first.widthM &&
      item.heightM === first.heightM
  );
  const straight =
    Math.floor(length / first.lengthM) * Math.floor(width / first.widthM);
  const rotated =
    Math.floor(length / first.widthM) * Math.floor(width / first.lengthM);
  if (!Number.isSafeInteger(straight) || !Number.isSafeInteger(rotated))
    return null;
  const capacity =
    homogeneous && fitsDimensions ? Math.max(straight, rotated) : null;
  return {
    fitsDimensions,
    fitsMass,
    fitsFloorArea,
    floorArea,
    capacity,
    fitsGrid: capacity === null ? null : shipment.count <= capacity,
    orientation: rotated > straight ? 'rotated' : 'straight',
    columns: Math.floor(
      width / (rotated > straight ? first.lengthM : first.widthM)
    ),
    rows: Math.floor(
      length / (rotated > straight ? first.widthM : first.lengthM)
    ),
  };
}
