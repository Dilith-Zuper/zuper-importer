/**
 * Brand-specific accessory upgrades by proposal tier.
 *
 * The wizard's default behavior is to put the SAME 19 universal accessories
 * into Good / Better / Best — which weakens the upsell story. These rules let
 * us swap in a higher-quality accessory at a specific tier transition for a
 * specific brand (e.g. CertainTeed Best upgrades from standard Ice & Water to
 * High Temp; OC Better upgrades plain Starter to WoodStart Cool).
 *
 * Resolution: at proposal-preview time, after universalMap is built for the
 * brand, applyTierUpgrades() picks alternative products from a pre-fetched
 * candidate pool (by manufacturer_norm + proposal_line_item / product_name).
 *
 * Adding a new rule:
 *   1. Identify a "good vs best" pairing in the SRS catalog for a brand.
 *   2. Add an entry below.
 *   3. The override applies on top of the universal accessor for the named
 *      `tier` package. Earlier tiers are unaffected.
 *
 * To rollback: remove the rule. No DB or code-path change required.
 */

export type ProposalTier = 'good' | 'better' | 'best'

export interface TierUpgradeRule {
  brand: string                              // manufacturer_norm of the shingle brand selected by CSM
  tier: ProposalTier                         // which proposal package gets the swap
  replace_component: string                  // UNIVERSAL_COMPONENT key being replaced (e.g. 'Ice & Water — Standard')
  with: {
    new_component?: string                   // optional: target proposal_line_item under which to find the upgrade
    manufacturer_norm?: string               // optional: constrain candidate to a specific manufacturer
    product_name_ilike?: string              // optional: ILIKE pattern on product_name
  }
}

export const TIER_UPGRADE_RULES: TierUpgradeRule[] = [
  // CertainTeed Best — Standard Ice & Water → High Temp self-adhered.
  // Rationale: Best-tier CertainTeed roof bundles ship with WinterGuard HT
  // for hot-deck applications (metal valleys, low-slope sections).
  {
    brand: 'Certainteed',
    tier: 'best',
    replace_component: 'Ice & Water — Standard',
    with: {
      new_component: 'Ice & Water — High Temp',
      manufacturer_norm: 'Certainteed',
    },
  },

  // Owens Corning Better — generic Starter → WoodStart Cool.
  // Rationale: Cool-roof starter strip aligns with OC's higher tiers.
  {
    brand: 'Owens Corning',
    tier: 'better',
    replace_component: 'Starter Strip',
    with: {
      manufacturer_norm: 'Owens Corning',
      product_name_ilike: '%WoodStart Cool%',
    },
  },

  // Owens Corning Best — same WoodStart Cool carries through.
  {
    brand: 'Owens Corning',
    tier: 'best',
    replace_component: 'Starter Strip',
    with: {
      manufacturer_norm: 'Owens Corning',
      product_name_ilike: '%WoodStart Cool%',
    },
  },
]

export function rulesForBrand(brand: string): TierUpgradeRule[] {
  return TIER_UPGRADE_RULES.filter(r => r.brand === brand)
}
