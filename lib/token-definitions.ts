export interface RequiredToken {
  name: string
  uom: string
}

export const REQUIRED_TOKENS: RequiredToken[] = [
  { name: 'Total Roof Area',              uom: 'SQFT' },
  { name: 'Suggested Waste Percentage %', uom: 'PCT'  },
  { name: 'Total Hip Length',             uom: 'LF'   },
  { name: 'Total Ridges Length',          uom: 'LF'   },
  { name: 'Total Eaves Length',           uom: 'LF'   },
  { name: 'Total Rakes Length',           uom: 'LF'   },
  { name: 'Total Valleys Length',         uom: 'LF'   },
  { name: 'Total Step Flashing Length',   uom: 'LF'   },
  { name: 'Headwall Flashing',            uom: 'LF'   },
  { name: 'Gutter Length',                uom: 'LF'   },
  { name: 'No of Downspouts',             uom: 'EA'   },
  { name: 'No of End Caps',               uom: 'EA'   },
  { name: 'No of Outside Miters',         uom: 'EA'   },
  { name: 'No of Inside Miters',          uom: 'EA'   },
  { name: 'No of Inner Elbows',           uom: 'EA'   },
  { name: 'No of Outer Elbows',           uom: 'EA'   },
  { name: 'Downspout Elbows',             uom: 'EA'   },
  { name: 'Total Siding Area',            uom: 'SQFT' },
]
