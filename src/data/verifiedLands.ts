import { VerifiedLandListing } from '../types/anagu';

import katampeImg from '../assets/images/katampe_abuja_hills_1794830624531.jpg';
import lekkiImg from '../assets/images/lekki_lagos_waterfront_1794830624949.jpg';
import enuguImg from '../assets/images/enugu_independence_layout_1794830625414.jpg';
import guzapeImg from '../assets/images/guzape_abuja_terrace_1794830626150.jpg';
import ikejaImg from '../assets/images/ikeja_gra_lagos_1794830626734.jpg';
import sagamuImg from '../assets/images/sagamu_industrial_corridor_1794830626335.jpg';
import portHarcourtImg from '../assets/images/portharcourt_new_gra_1794830627597.jpg';
import kanoImg from '../assets/images/kano_nassarawa_gra_1794830628250.jpg';
import ibadanImg from '../assets/images/ibadan_old_bodija_1794830627761.jpg';

export const VERIFIED_LANDS_FOR_SALE: VerifiedLandListing[] = [
  {
    id: 'VLD-001',
    cadastralRef: 'FCT/AMAC/KAT/0891-B',
    title: 'Katampe Extension Diplomatic Plot',
    district: 'Katampe Extension',
    state: 'Federal Capital Territory',
    lga: 'Abuja Municipal (AMAC)',
    areaSqm: 1845,
    priceUsd: 110000,
    intendedUse: 'Residential',
    sellerName: 'Dr. Aminu Bello Abubakar',
    sellerWallet: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    surveyPlanRef: 'NIS/FCT/SP/2026/0411',
    spatialHash: '0x3a9f0291e0a9d821fc003192019a8200192a01f8938210921938910293019283',
    tokenId: 4092,
    verificationBadge: 'C of O Verified',
    landmark: 'Aso Rock & Abuja Central Skyline',
    imageUrl: katampeImg
  },
  {
    id: 'VLD-002',
    cadastralRef: 'LAG/ETI/LEK/0902-C',
    title: 'Lekki Phase 1 Waterfront Parcel',
    district: 'Lekki Phase 1',
    state: 'Lagos State',
    lga: 'Eti-Osa',
    areaSqm: 2420,
    priceUsd: 160000,
    intendedUse: 'Commercial',
    sellerName: 'Folashade Adeyemi Holdings Ltd',
    sellerWallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    surveyPlanRef: 'SURV/LAG/2026/8991',
    spatialHash: '0x7b210948ac019283f01928401928301928301928301928301928301928301928',
    tokenId: 4105,
    verificationBadge: 'C of O Verified',
    landmark: 'Lekki-Ikoyi Link Bridge & Lagos Lagoon',
    imageUrl: lekkiImg
  },
  {
    id: 'VLD-003',
    cadastralRef: 'ENU/ENN/IND/0814-D',
    title: 'Independence Layout Corner Estate',
    district: 'Independence Layout Phase 2',
    state: 'Enugu State',
    lga: 'Enugu North',
    areaSqm: 1450,
    priceUsd: 55000,
    intendedUse: 'Residential',
    sellerName: 'Nnamdi Okafor Estates Ltd',
    sellerWallet: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    surveyPlanRef: 'EN/GIS/CAD/2026/0419',
    spatialHash: '0x5c11902938475610aabbccddeeff11223344556677889900aabbccddeeff1122',
    tokenId: 4118,
    verificationBadge: 'C of O Verified',
    landmark: 'Udi Hills & Independence Avenue',
    imageUrl: enuguImg
  },
  {
    id: 'VLD-004',
    cadastralRef: 'FCT/AMAC/GUZ/1104-A',
    title: 'Guzape Hills Terrace Plot',
    district: 'Guzape District',
    state: 'Federal Capital Territory',
    lga: 'Abuja Municipal (AMAC)',
    areaSqm: 1200,
    priceUsd: 96500,
    intendedUse: 'Residential',
    sellerName: 'Zainab & Yusuf Realty Partners',
    sellerWallet: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    surveyPlanRef: 'NIS/FCT/SP/2026/1104',
    spatialHash: '0x91827364550192837465aabbccdd112233445566778899001122334455667788',
    tokenId: 4132,
    verificationBadge: 'C of O Verified',
    landmark: 'Guzape Ridge & National Skyline',
    imageUrl: guzapeImg
  },
  {
    id: 'VLD-005',
    cadastralRef: 'LAG/IKE/GRA/2041-B',
    title: 'Ikeja GRA Executive Commercial Lot',
    district: 'Ikeja GRA',
    state: 'Lagos State',
    lga: 'Ikeja',
    areaSqm: 1680,
    priceUsd: 140000,
    intendedUse: 'Commercial',
    sellerName: 'Babajide Sanwo Commercial Trust',
    sellerWallet: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    surveyPlanRef: 'SURV/LAG/2026/2041',
    spatialHash: '0x445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233',
    tokenId: 4147,
    verificationBadge: 'C of O Verified',
    landmark: 'Ikeja Executive Business Boulevard',
    imageUrl: ikejaImg
  },
  {
    id: 'VLD-006',
    cadastralRef: 'OGN/SAG/IND/3318-C',
    title: 'Sagamu Interchange Logistics Park',
    district: 'Sagamu Industrial Corridor',
    state: 'Ogun State',
    lga: 'Sagamu',
    areaSqm: 5000,
    priceUsd: 63000,
    intendedUse: 'Industrial',
    sellerName: 'Gateway Agro-Industrial Holdings',
    sellerWallet: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
    surveyPlanRef: 'OG/SURV/2026/3318',
    spatialHash: '0x6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b',
    tokenId: 4160,
    verificationBadge: 'C of O Verified',
    landmark: 'Sagamu Expressway Logistics Interchange',
    imageUrl: sagamuImg
  },
  {
    id: 'VLD-007',
    cadastralRef: 'RIV/PHC/GRA/4410-A',
    title: 'New GRA Phase 2 Residence Plot',
    district: 'New GRA Phase 2',
    state: 'Rivers State',
    lga: 'Port Harcourt City',
    areaSqm: 1350,
    priceUsd: 78500,
    intendedUse: 'Residential',
    sellerName: 'Tamuno-Boma Heritage Trust',
    sellerWallet: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
    surveyPlanRef: 'RV/GIS/2026/4410',
    spatialHash: '0x8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e',
    tokenId: 4174,
    verificationBadge: 'C of O Verified',
    landmark: 'New GRA Palm Boulevard',
    imageUrl: portHarcourtImg
  },
  {
    id: 'VLD-008',
    cadastralRef: 'KAN/NAS/GRA/5192-B',
    title: 'Nassarawa GRA Commercial Plaza Site',
    district: 'Nassarawa GRA',
    state: 'Kano State',
    lga: 'Nassarawa',
    areaSqm: 2100,
    priceUsd: 85000,
    intendedUse: 'Commercial',
    sellerName: 'Sani Dantata Properties Nig Ltd',
    sellerWallet: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
    surveyPlanRef: 'KN/SURV/2026/5192',
    spatialHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    tokenId: 4189,
    verificationBadge: 'C of O Verified',
    landmark: 'Nassarawa Civic & Commercial Quarter',
    imageUrl: kanoImg
  },
  {
    id: 'VLD-009',
    cadastralRef: 'OYO/IBN/BOD/6205-C',
    title: 'Old Bodija Cornerstone Estate Plot',
    district: 'Old Bodija',
    state: 'Oyo State',
    lga: 'Ibadan North',
    areaSqm: 1120,
    priceUsd: 42500,
    intendedUse: 'Agricultural',
    sellerName: 'Chief Adebayo Oladipo Family',
    sellerWallet: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
    surveyPlanRef: 'OY/CAD/2026/6205',
    spatialHash: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    tokenId: 4203,
    verificationBadge: 'C of O Verified',
    landmark: 'Cocoa House Skyline & Bodija Canopy',
    imageUrl: ibadanImg
  }
];

export function getLandmarkImageForParcel(
  state: string,
  intendedUse: VerifiedLandListing['intendedUse']
): string {
  const s = state.toLowerCase();
  if (s.includes('lagos')) return intendedUse === 'Commercial' ? ikejaImg : lekkiImg;
  if (s.includes('enugu')) return enuguImg;
  if (s.includes('ogun')) return sagamuImg;
  if (s.includes('rivers') || s.includes('port harcourt')) return portHarcourtImg;
  if (s.includes('kano')) return kanoImg;
  if (s.includes('oyo') || s.includes('ibadan')) return ibadanImg;
  if (s.includes('abuja') || s.includes('fct') || s.includes('federal capital')) {
    return intendedUse === 'Commercial' ? guzapeImg : katampeImg;
  }
  if (intendedUse === 'Industrial') return sagamuImg;
  if (intendedUse === 'Agricultural') return ibadanImg;
  if (intendedUse === 'Commercial') return kanoImg;
  return katampeImg;
}

