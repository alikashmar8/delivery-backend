/**
 * Lebanon administrative regions seed.
 * Run via: INSERTs in migration or `regions:seed` CLI.
 * Governates + example districts/areas — extend as needed.
 */
export const lebanonSeed = [
  { code: 'LB', name: 'Lebanon', type: 'country', parentCode: null },
  // Governorates
  { code: 'LB-BE', name: 'Beirut', type: 'governorate', parentCode: 'LB' },
  {
    code: 'LB-ML',
    name: 'Mount Lebanon',
    type: 'governorate',
    parentCode: 'LB',
  },
  { code: 'LB-NA', name: 'North', type: 'governorate', parentCode: 'LB' },
  { code: 'LB-BA', name: 'Beqaa', type: 'governorate', parentCode: 'LB' },
  { code: 'LB-AS', name: 'South', type: 'governorate', parentCode: 'LB' },
  { code: 'LB-AK', name: 'Akkar', type: 'governorate', parentCode: 'LB' },
  {
    code: 'LB-BH',
    name: 'Baalbek-Hermel',
    type: 'governorate',
    parentCode: 'LB',
  },
  { code: 'LB-JA', name: 'Nabatieh', type: 'governorate', parentCode: 'LB' },
  // Example districts (extend per needs)
  { code: 'LB-BE-BE', name: 'Beirut', type: 'district', parentCode: 'LB-BE' },
  { code: 'LB-ML-BA', name: 'Baabda', type: 'district', parentCode: 'LB-ML' },
  { code: 'LB-ML-MT', name: 'Matn', type: 'district', parentCode: 'LB-ML' },
];
