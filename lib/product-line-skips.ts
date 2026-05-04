/**
 * Product line prefixes to DESELECT by default in Step 3.
 * Derived by cross-referencing the Zuper product master dump — these lines
 * don't appear in any roofing contractor account, meaning they're commercial,
 * solar, interior, or otherwise non-residential-roofing products.
 *
 * A line is skipped if it STARTS WITH any prefix in this list (case-insensitive).
 */
export const SKIP_PREFIXES: Record<string, string[]> = {
  Gaf: [
    // Commercial TPO / PVC membrane
    'EverGuard',
    // Commercial modified bitumen
    'RUBEROID', 'GAFGLAS', 'LIBERTY SBS', 'LIBERTY Asphalt', 'LIBERTY Flashing',
    'Tri-Ply',
    // Solar / integrated roofing
    'Timberline S1', 'Timberline Solar',
    // Commercial coatings & adhesives
    'United Coatings', 'HydroStop', 'MATRIX', 'Unisil', 'OlyBond', 'OMG OlyBond',
    'Acrylex', 'Bleed-Block', 'MajorSeal', 'TopCoat', 'TOPCOAT', 'WOD Acrylic',
    'CleanAct', 'EnergyCote', 'Acrylic HydroStop', 'High-Tensile Acrylic',
    'Hydrostop', 'Spray-Grade Acrylic', 'Masonex', 'Premium Brush-Grade',
    'Premium Acrylic', 'FlexSeal', 'Fibered Silicone', 'Thermoplastic',
    'SPF Flashing', 'Epoxy Primer', 'Multi-Purpose Primer', 'UniBase',
    'XR-2000', 'SureBond', 'M-BOND', 'Lock-Down', 'Bonding Primer',
    // Commercial insulation / board
    'DEXcell', 'EnergyGuard', 'DensDeck', 'USG Securock', 'ThermaCal',
    'EPS Polystyrene', 'STRUCTODEK', 'VersaShield',
    // Commercial fasteners (not residential nails)
    'Drill-Tec', 'ASAP Assembled', 'Heavy Duty ASAP', 'XHD ASAP',
    'OlyBond500',
    // Commercial accessories
    'M-WELD', 'M-Thane', 'M-Curb',
    'FireOut', 'SA PRIMER', 'Self-Adhered Vapor',
    'PVC Membrane Conditioner', 'PVC Square',
    'TPO Drain', 'TPO Solvent', 'TPO WB181', 'TPO Quick Hose',
    'TPO Self-Adhered', 'TPO Seam', 'TPO with',
    'WeatherSide',
    // Tools
    'Hand Roof Brush', 'Roller Cover', 'Cleaning Concentrate',
  ],

  Certainteed: [
    // Interior / drywall / ceiling
    'GlasRoc', 'M2Tech', 'VinylShield', 'Symphony m', 'THEATRE',
    'Fine Fissured', 'Cashmere', 'Sand Micro', 'Sereno', 'Baroque',
    'EZ Stab', 'EZ Set',
    'Drywall', 'Regular Drywall', 'No-Coat', 'VINYLROCK', 'Magoxide',
    'FibraFuse', 'FibaFuse', 'Easi-Lite', 'Easi-Tex', 'SilentFX',
    'MARCO', 'Levelline', 'Quickspan', 'Galvanized Wall', 'Galvanized Narrow',
    'School Board', 'Open Plan', 'Envirogard', 'Aquarock',
    'Aquarock', 'Extreme Abuse', 'Lite All Purpose', 'Lite Finishing',
    'All Weather', 'Black Diamond', 'Type C', 'Type X',
    // Commercial modified bitumen / roof coatings
    'Flintlastic', 'Flintglas', 'Flintclad', 'FLINTGLAS', 'Glasbase',
    'FlintBoard', 'FlintBond', 'FlintPrime', 'FlintFast', 'FlintPatch',
    'FlintRock', 'DryRoof', 'Arctic Edge', 'SMARTFAB', 'SMARTCOAT',
    'SmartFlash', 'Smartcoat', 'Smartflash', 'Ultra Flintlastic',
    'CertaSeam', 'CertaTape',
    'Grace VYCOR',
    // Solar
    'Solstice',
    // Acoustic / specialty
    'Green Glue',
    // Stone / structural columns / railings / decorative
    'STONEfaçade', 'Restoration Millwork',
    'Kingston', 'Oxford',
    '1-Piece', '2-Piece', '4-Piece',
    'Certa-Snap', 'Square Column', 'Round Non-Tapered', 'Square Blank',
    'New England External', 'Flat External', 'Flat Wood Post',
    'Decorative Post', 'Decorative Porch', 'Structural Colonial',
    'Structural Square', 'Square Cap', 'Routed System', 'Handrail',
    'Double Channel', 'Perimeter Vinyl Triple', 'STBAR',
    'TrueTexture', 'Scratch & Dent', 'Shadow Molding',
    // Insulation
    'InsulSafe', 'Batt Fiberglass',
    // Interior wallboard continuations
    'Easi', 'SilentFX', 'ProPink ComfortSeal',
    // RISE composite siding/trim (exterior but not roofing)
    'RISE',
  ],

  'Owens Corning': [
    // Insulation (all FOAMULAR, PINK, ProPink, AttiCat)
    'FOAMULAR', 'PINK Next Gen', 'Thermafiber', 'ProPink', 'AttiCat',
    'ProCat', 'Insulation Next Gen', 'M62Q', 'BILD-R-TAPE',
    'Raft-R-Mate',
    // Non-roofing structural / decking
    'WEARDECK', 'Structural Composite',
    // Solar
    'Solar Attic',
    // Wrap / tape (non-roofing)
    'PINKWRAP',
    // Lighting / specialty
    'SmartCap Attic Light',
    // Commercial SBS
    'Trumbull',
    // Attic stair insulation
    'Attic Stairway',
    'OC FOAMULAR',
  ],
}

export function shouldSkipByDefault(brand: string, productLine: string): boolean {
  const prefixes = SKIP_PREFIXES[brand] ?? []
  const lower = productLine.toLowerCase()
  return prefixes.some(p => lower.startsWith(p.toLowerCase()))
}
