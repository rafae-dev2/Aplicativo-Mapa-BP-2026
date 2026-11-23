import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WATER_TRUCK_CATEGORIES,
  TRUCK_CATEGORIES,
  WATER_AND_TRUCK_CATEGORIES,
  isGroupHidden,
  setGroupHidden,
  toggleCategoryGroup,
  filterVisiblePois,
  countCategoryGroup,
  parseHiddenCategories,
  serializeHiddenCategories,
} from './poiVisibility';

const SAMPLE_POIS = [
  { id: '1', category: 'represa' },
  { id: '2', category: 'represa' },
  { id: '3', category: 'transporte_insumo' },
  { id: '4', category: 'incendio' },
  { id: '5', category: 'marcacao' },
];

test('hides represas/pegadores de água without hiding trucks or alerts', () => {
  const hidden = toggleCategoryGroup(new Set(), WATER_TRUCK_CATEGORIES);
  assert.equal(isGroupHidden(hidden, WATER_TRUCK_CATEGORIES), true);
  assert.equal(isGroupHidden(hidden, TRUCK_CATEGORIES), false);

  const visible = filterVisiblePois(SAMPLE_POIS, hidden);
  assert.deepEqual(visible.map((p) => p.id), ['3', '4', '5']);
});

test('hides transport trucks individually and together with represas', () => {
  const onlyTrucksHidden = setGroupHidden(new Set(), TRUCK_CATEGORIES, true);
  assert.deepEqual(
    filterVisiblePois(SAMPLE_POIS, onlyTrucksHidden).map((p) => p.id),
    ['1', '2', '4', '5']
  );

  const bothHidden = toggleCategoryGroup(onlyTrucksHidden, WATER_AND_TRUCK_CATEGORIES);
  assert.equal(isGroupHidden(bothHidden, WATER_AND_TRUCK_CATEGORIES), true);
  assert.deepEqual(
    filterVisiblePois(SAMPLE_POIS, bothHidden).map((p) => p.id),
    ['4', '5']
  );

  const restored = toggleCategoryGroup(bothHidden, WATER_AND_TRUCK_CATEGORIES);
  assert.equal(isGroupHidden(restored, WATER_AND_TRUCK_CATEGORIES), false);
  assert.equal(filterVisiblePois(SAMPLE_POIS, restored).length, 5);
});

test('counts category groups accurately', () => {
  assert.equal(countCategoryGroup(SAMPLE_POIS, WATER_TRUCK_CATEGORIES), 2);
  assert.equal(countCategoryGroup(SAMPLE_POIS, TRUCK_CATEGORIES), 1);
  assert.equal(countCategoryGroup(SAMPLE_POIS, WATER_AND_TRUCK_CATEGORIES), 3);
});

test('serializes and parses hidden categories safely', () => {
  const initial = new Set(['transporte_insumo', 'represa']);
  const encoded = serializeHiddenCategories(initial);
  const parsed = parseHiddenCategories(encoded);
  assert.deepEqual(Array.from(parsed).sort(), ['represa', 'transporte_insumo']);
  assert.deepEqual(Array.from(parseHiddenCategories('invalid-json')), []);
  assert.deepEqual(Array.from(parseHiddenCategories(null)), []);
});
