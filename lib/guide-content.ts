export interface StepGuide {
  title: string
  description: string
  steps: { heading: string; detail: string }[]
  faqs: { q: string; a: string }[]
}

export const GUIDES: Record<number, StepGuide> = {
  1: {
    title: 'Connect to Zuper',
    description: 'Authenticate this tool against your Zuper account. It needs your company login name and an API key to read account configuration and write products.',
    steps: [
      {
        heading: 'Find your company login name',
        detail: 'This is found in the Zuper internal admin panel. Ask your Zuper admin or CSM if you are unsure.',
      },
      {
        heading: 'Get your API key',
        detail: 'In Zuper go to Settings → Developer Hub → API Key. Click New API Key, give it a name like "SRS Importer", and copy the key immediately — it is only shown once.',
      },
      {
        heading: 'Create new or use existing?',
        detail: 'Create a new key for this tool. If you already made one in a previous import run, you can reuse it. Do not share keys across different tools.',
      },
      {
        heading: 'Paste both and click Connect',
        detail: 'The tool verifies your credentials before proceeding. If it fails, double-check that the login name has no extra spaces and the API key was copied in full.',
      },
    ],
    faqs: [
      { q: 'Where exactly is Developer Hub?', a: 'Zuper → top-right avatar menu → Settings → Developer Hub → API Key tab → New API Key.' },
      { q: 'The connection failed — what do I check?', a: 'Confirm the login name matches exactly what is in the admin panel (no capitals, no spaces). Make sure the full API key was copied with no trailing whitespace.' },
      { q: 'Can I reuse an API key across multiple imports?', a: 'Yes — API keys do not expire or get consumed. Save the key somewhere safe and reuse it for every import run.' },
    ],
  },

  2: {
    title: 'Select Trades',
    description: 'Choose which product trades to import. Only the catalog for selected trades will be fetched from SRS. You can run the wizard again later for any trade you skip now.',
    steps: [
      {
        heading: 'Roofing is pre-selected',
        detail: 'Covers the full SRS shingles, accessories, and universal items catalog. Keep it on unless you only need gutters or siding.',
      },
      {
        heading: 'Add Gutters if needed',
        detail: 'Imports aluminum/coil gutter sections, downspouts, elbows, end caps, and guards from the SRS gutter catalog.',
      },
      {
        heading: 'Add Siding if needed',
        detail: 'Imports vinyl and composite siding product lines. You will pick specific brands in the next step.',
      },
      {
        heading: 'Select all trades this account needs',
        detail: 'You cannot add a trade later without re-running the wizard from this step. When in doubt, select it.',
      },
    ],
    faqs: [
      { q: 'Can I run the import again for a missed trade?', a: 'Yes — run the wizard again, select only the trade you missed, and it will add those products without affecting existing ones.' },
      { q: 'What if the account only does flat roofing?', a: 'Still select Roofing. The catalog includes flat roofing accessories (TPO, EPDM, coatings).' },
      { q: 'Do gutters and siding need separate validation?', a: 'No — validation runs once for all selected trades together.' },
    ],
  },

  3: {
    title: 'Select Brands',
    description: 'Choose which manufacturers to import within each trade. Only products from the brands you select here will appear in the product preview and upload.',
    steps: [
      {
        heading: 'Roofing — Big 3 are pre-selected',
        detail: 'GAF, CertainTeed, and Owens Corning cover 80%+ of residential roofing accounts. These are pre-checked.',
      },
      {
        heading: 'Add secondary roofing brands',
        detail: 'Atlas, Malarkey, TAMKO, IKO, and others are available. Use the search box to find a specific brand.',
      },
      {
        heading: 'Gutters and Siding brands',
        detail: 'If those trades were selected, their brand lists appear on separate tabs. Search and check each brand the account carries.',
      },
      {
        heading: 'Select broadly',
        detail: 'It is faster to delete an unused product in Zuper later than to re-run the wizard for a missed brand.',
      },
    ],
    faqs: [
      { q: 'A brand I carry is not listed.', a: 'The catalog covers SRS Distribution\'s stocked brands. If a brand is not listed, SRS likely does not carry it in your region.' },
      { q: 'How many brands can I select?', a: 'No limit — select as many as you need.' },
      { q: 'Do I need to select brands for every trade?', a: 'Only for the trades you enabled in the previous step. Tabs for non-selected trades will not appear.' },
    ],
  },

  4: {
    title: 'Select Product Lines',
    description: 'Filter each brand down to the specific product lines the account actually sells. This keeps the catalog focused and avoids importing hundreds of products no one will use.',
    steps: [
      {
        heading: 'Roofing lines are pre-selected',
        detail: 'Standard residential lines (Timberline, Landmark, Duration, etc.) are checked by default. Review and deselect any lines the account does not carry.',
      },
      {
        heading: 'Specialty lines are unchecked',
        detail: 'Commercial, solar, insulation, and other specialty lines are grouped separately and off by default. Only enable them if the account needs them.',
      },
      {
        heading: 'Gutters and Siding lines',
        detail: 'All lines are pre-selected for these trades. Deselect anything the account does not stock.',
      },
      {
        heading: 'When in doubt, keep it',
        detail: 'Deleting an unused product in Zuper takes seconds. Re-running the wizard for a missed product line takes much longer.',
      },
    ],
    faqs: [
      { q: 'What are the "Skip" badge categories?', a: 'Lines flagged as non-residential or specialty (commercial membrane, solar, acoustic, etc.). Most residential roofers do not need them.' },
      { q: 'Can I change this selection after upload?', a: 'Only by re-running the wizard. Make a broad selection the first time.' },
      { q: 'Why are some lines shown in a different section?', a: 'The UI separates core roofing lines (which have G/B/B proposal value) from specialty lines to make the choice clearer.' },
    ],
  },

  5: {
    title: 'Preview Your Catalog',
    description: 'Review exactly which products will be uploaded before anything is sent to Zuper. Browse by brand or category and confirm the selection looks right.',
    steps: [
      {
        heading: 'Check the total count',
        detail: 'A typical residential import is 500–1,500 products. If the number looks unexpectedly low or high, go back to Product Lines and adjust.',
      },
      {
        heading: 'Browse by brand tab',
        detail: 'Click each brand tab to confirm the right product lines are included. Look at the category breakdown for each brand.',
      },
      {
        heading: 'Universal accessories are always included',
        detail: '20 standard accessories (drip edge, nails, underlayment, pipe boots, ridge vent, etc.) are automatically added to every import regardless of brand selection.',
      },
      {
        heading: 'Click Confirm to proceed',
        detail: 'This locks in the product list and moves to pre-flight validation. You can still go back if needed.',
      },
    ],
    faqs: [
      { q: 'Can I remove individual products here?', a: 'Not in this step — go back to Product Lines to narrow the selection, or remove products in Zuper after upload.' },
      { q: 'Why do I see "Manufacturer Varies" products?', a: 'These are universal items (valley metal, certain flashings) where the supplier varies by region. They are included as generic entries.' },
      { q: 'What are the universal accessories?', a: 'A fixed set: drip edge, synthetic underlayment, ice & water shield, coil nails, cap nails, step flashing, valley metal, pipe boots, ridge vent, starter strip, and caulk.' },
    ],
  },

  6: {
    title: 'Pre-flight Validation',
    description: 'Before uploading, the tool checks that your Zuper account has all the required configuration — product categories, a default warehouse, measurement tokens, CPQ formulas, and custom fields.',
    steps: [
      {
        heading: 'Wait for checks to run',
        detail: 'Each check runs automatically in sequence. Green means ready, red means action is needed before you can continue.',
      },
      {
        heading: 'If a required check fails',
        detail: 'The detail column explains exactly what is missing. Most failures are missing product categories that need to be created in Zuper → Products → Categories first.',
      },
      {
        heading: 'Optional checks (Tier field, Service Categories)',
        detail: 'These are non-blocking. If they fail, products still upload — just without tier tagging or auto-categorised services.',
      },
      {
        heading: 'Click Continue when all required checks pass',
        detail: 'The button is disabled until every required check shows green. Fix any red required checks and refresh to re-run.',
      },
    ],
    faqs: [
      { q: 'The "Categories" check failed.', a: 'Go to Zuper → Products → Categories and create the missing category (e.g. "Roofing Materials"), then return here and re-run validation.' },
      { q: 'What is the Warehouse check?', a: 'Confirms a default warehouse exists in Zuper for inventory location tracking. Create one in Zuper → Inventory → Warehouses if missing.' },
      { q: 'What are CPQ Formulas?', a: 'Measurement-based quantity formulas (e.g. squares of roofing = area ÷ 100). They auto-fill quantities on proposals. If missing, products upload but proposals won\'t auto-calculate.' },
    ],
  },

  7: {
    title: 'Upload Products',
    description: 'Products are sent to Zuper in batches of 100 with a 3-second pause between batches to stay within API rate limits. Services are uploaded after all products complete.',
    steps: [
      {
        heading: 'Phase 1 — Products',
        detail: 'Watch the progress bar and live log. Each product appears as it is processed. Green entries succeeded, red entries failed.',
      },
      {
        heading: 'Phase 2 — Services',
        detail: 'After products, 28 standard roofing services (inspection, tear-off, install by slope tier, etc.) are uploaded automatically.',
      },
      {
        heading: 'Do not close the tab',
        detail: 'The upload runs as a live stream. Closing or navigating away will interrupt it. Leave the tab open until the completion banner appears.',
      },
      {
        heading: 'Download errors when done',
        detail: 'If any products failed, a "Download Error List" button appears. Most errors are duplicates already in the account.',
      },
    ],
    faqs: [
      { q: 'How long does the upload take?', a: 'Typically 8–15 minutes for a 600-product import. Larger catalogs (1,000+ products) may take 20–30 minutes.' },
      { q: 'A product failed — will it retry automatically?', a: 'No. Download the error CSV and re-upload failed products manually, or re-run the wizard and only those products will fail again (they won\'t duplicate).' },
      { q: 'Can I run this on an account that already has products?', a: 'Yes. Existing products are not deleted or modified. Duplicates will show as errors in the log.' },
    ],
  },

  8: {
    title: 'Import Complete',
    description: 'The product and service import is finished. Review the summary and decide whether to continue to proposal template creation.',
    steps: [
      {
        heading: 'Review the summary',
        detail: 'Check the uploaded product count, services count, and error count. A successful import typically has 0–5 errors.',
      },
      {
        heading: 'Handle errors if any',
        detail: 'Download the error CSV, identify the failed products, and add them manually in Zuper if needed.',
      },
      {
        heading: 'Continue to Proposal Templates',
        detail: 'Click the button to go to Step 9 and automatically create Good/Better/Best CPQ proposal templates for each brand.',
      },
    ],
    faqs: [
      { q: 'Where do I find the uploaded products in Zuper?', a: 'Zuper → Products → All Products. Filter by "Date Added" to see today\'s imports at the top.' },
      { q: 'The count looks lower than expected.', a: 'Some products may have been skipped as duplicates (already existed in the account). Check the error CSV for details.' },
      { q: 'Do I have to create proposal templates?', a: 'No — templates are optional. You can skip Step 9 and use the products as-is. Templates just make CPQ proposals faster to generate.' },
    ],
  },

  9: {
    title: 'Proposal Templates',
    description: 'Automatically create Good/Better/Best CPQ proposal templates in Zuper — one per selected brand. Templates use the uploaded products and measurement formulas to auto-fill quantities on proposals.',
    steps: [
      {
        heading: 'Pre-flight check',
        detail: 'The tool looks for a "Roof Inspection" job category, a "Create Proposal" job status, and a layout template. If any are missing, you will be shown what to create in Zuper first.',
      },
      {
        heading: 'Review the package preview',
        detail: 'Each brand shows a 3-column card (Good / Better / Best) listing which products go into each tier. Review before creating.',
      },
      {
        heading: 'Click Create Templates',
        detail: 'Templates are created one brand at a time with a live progress stream. Do not close the tab during creation.',
      },
      {
        heading: 'Find templates in Zuper',
        detail: 'After creation, go to Zuper → Proposals → Templates to find and activate your new CPQ templates.',
      },
    ],
    faqs: [
      { q: 'What is a CPQ proposal template?', a: 'A pre-built proposal in Zuper that auto-fills line item quantities using measurement formulas when triggered at a job — no manual data entry needed.' },
      { q: 'Will this overwrite existing templates?', a: 'No. New templates are created with a fresh name. Existing templates are untouched.' },
      { q: 'One brand failed to create. What do I do?', a: 'Note the brand name, then manually create a template in Zuper → Proposals → Templates using the product list shown in the preview.' },
    ],
  },
}
