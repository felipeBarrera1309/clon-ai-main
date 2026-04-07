# Payment Fields Migration Guide

## Overview

This guide explains how to migrate payment-related data from the old field names to the new field names in the `restaurantConfiguration` table.

## Background

As part of the payment methods system overhaul, the following changes were made:

### Schema Changes
- **Old Field**: `paymentUrl` (generic name)
- **New Field**: `paymentLinkUrl` (specific to payment link method)

### New Features Added
- `bankAccounts` - Array of bank account strings for bank transfer method
- `acceptPaymentLink` - Boolean to enable/disable payment link method
- `acceptBankTransfer` - Boolean to enable/disable bank transfer method

### Payment Methods Enum
- `"cash"` - Efectivo (Cash)
- `"card"` - Datafono (Card/POS Terminal)
- `"payment_link"` - Pago por Link de Pago (Payment Link)
- `"bank_transfer"` - Transferencia a Cuenta Bancaria (Bank Transfer)

## Migration Required

The migration script copies data from `paymentUrl` to `paymentLinkUrl` for all organizations that have a value in `paymentUrl`.

### What the Migration Does

1. ✅ Finds all `restaurantConfiguration` records
2. ✅ For each record with a non-empty `paymentUrl`:
   - Checks if `paymentLinkUrl` already has a value (skips if it does)
   - Copies the value from `paymentUrl` to `paymentLinkUrl`
3. ✅ Logs detailed information about what was migrated
4. ✅ Returns a summary with counts of migrated/skipped/errored records

### What the Migration Does NOT Do

- ❌ Does NOT delete the old `paymentUrl` field (backward compatible)
- ❌ Does NOT modify existing `paymentLinkUrl` values
- ❌ Does NOT migrate empty/null values

## How to Run the Migration

### Prerequisites

1. Ensure you have the latest code deployed:
   ```bash
   cd packages/backend
   npx convex deploy --yes
   ```

### Step 1: Dry Run (Recommended)

First, run a dry run to see what would be migrated without making any changes:

```bash
npx convex run system/migrations/migratePaymentFields:dryRun --prod
```

**Example Output:**
```
[LOG] Starting dry run of payment field migration...
[LOG] Found 5 restaurant configurations to process

============================================================
DRY RUN PREVIEW
============================================================
Total Configurations: 5
Would Migrate: 2
Would Skip: 3
============================================================

Configurations that would be migrated:
  ✅ org_abc123
     Current paymentUrl: "https://pay.example.com/restaurant1"
     Future paymentLinkUrl: "https://pay.example.com/restaurant1"
  ✅ org_def456
     Current paymentUrl: "https://payment.link/r2"
     Future paymentLinkUrl: "https://payment.link/r2"

Configurations that would be skipped:
  ⏭️  org_ghi789
     Reason: No paymentUrl to migrate
  ⏭️  org_jkl012
     Reason: paymentLinkUrl already has a value
  ⏭️  org_mno345
     Reason: No paymentUrl to migrate
```

### Step 2: Review the Dry Run Results

Check the output to ensure:
- Organizations that should be migrated are listed
- Organizations that should be skipped make sense
- No unexpected organizations appear

### Step 3: Run the Actual Migration

Once you're satisfied with the dry run results, run the actual migration:

```bash
npx convex run system/migrations/migratePaymentFields:migratePaymentUrl --prod
```

**Example Output:**
```
[LOG] Starting payment field migration...
[LOG] Found 5 restaurant configurations to process
[LOG] ✅ Migrated organization org_abc123: "https://pay.example.com/restaurant1" → paymentLinkUrl
[LOG] ✅ Migrated organization org_def456: "https://payment.link/r2" → paymentLinkUrl
[LOG] Skipping organization org_ghi789: no paymentUrl to migrate
[LOG] Skipping organization org_jkl012: paymentLinkUrl already has a value: "https://existing.url"
[LOG] Skipping organization org_mno345: no paymentUrl to migrate

============================================================
Migration Summary:
============================================================
Total Configurations: 5
Migrated: 2
Skipped: 3
Errors: 0
============================================================
✅ Migration completed successfully! Migrated 2 configurations, skipped 3.
```

## Verification

After running the migration, verify the results:

### Option 1: Check in Convex Dashboard

1. Go to your Convex dashboard
2. Navigate to the `restaurantConfiguration` table
3. For each organization, verify:
   - Old `paymentUrl` field still has its original value
   - New `paymentLinkUrl` field now has the same value

### Option 2: Query the Database

Run a query to check specific organizations:

```bash
npx convex run private/config:get '{"organizationId":"org_YOUR_ORG_ID"}' --prod
```

Check that both `paymentUrl` and `paymentLinkUrl` have the expected values.

## Safety Features

### Idempotent
The migration can be run multiple times safely. If `paymentLinkUrl` already has a value, the organization will be skipped.

```bash
# First run - migrates data
npx convex run system/migrations/migratePaymentFields:migratePaymentUrl --prod
# Output: Migrated: 2

# Second run - skips already migrated
npx convex run system/migrations/migratePaymentFields:migratePaymentUrl --prod
# Output: Migrated: 0, Skipped: 2
```

### Non-Destructive
The old `paymentUrl` field is never deleted or modified. The migration only adds/updates the new `paymentLinkUrl` field.

### Validation
Only non-empty, non-whitespace values are migrated. Empty strings or undefined values are skipped.

## Rollback (If Needed)

If something goes wrong, you can manually revert by:

1. **Option 1**: Clear the `paymentLinkUrl` field for affected organizations:
   ```bash
   # Via Convex dashboard or CLI, set paymentLinkUrl to undefined
   ```

2. **Option 2**: Re-run the migration after fixing data issues
   - The migration will skip organizations that already have `paymentLinkUrl` set
   - You can manually clear `paymentLinkUrl` for specific organizations if needed

## Troubleshooting

### Problem: "Could not find function" error

**Solution**: Deploy the migration scripts first:
```bash
cd packages/backend
npx convex deploy --yes
```

### Problem: Some organizations were not migrated

**Solution**: Check if those organizations:
- Have a `paymentUrl` value (migration only runs for non-empty values)
- Already have a `paymentLinkUrl` value (migration skips these)
- Run the dry run again to see the preview

### Problem: Migration completed with errors

**Solution**: 
1. Check the error logs for specific organizations
2. Verify those organizations exist in the database
3. Check for data corruption or invalid values
4. Fix the specific issues and re-run the migration

## Timeline Recommendation

1. **Day 1**: Deploy code with new schema fields
2. **Day 2**: Run dry run and review results
3. **Day 3**: Run actual migration during low-traffic hours
4. **Day 4**: Verify migration results
5. **Day 5+**: Monitor for any issues

## Post-Migration

After successful migration:

1. ✅ Verify all organizations have correct `paymentLinkUrl` values
2. ✅ Update any external documentation referencing `paymentUrl`
3. ✅ Monitor error logs for any references to the old field name
4. ✅ Consider deprecating the `paymentUrl` field in a future schema update

## Support

If you encounter issues:
1. Check the Convex function logs in the dashboard
2. Run the dry run again to see current state
3. Review the migration summary output
4. Contact the development team with specific organization IDs and error messages

---

**Last Updated**: January 2025
**Migration Script Version**: 1.0
**Schema Version**: Post-payment-overhaul
