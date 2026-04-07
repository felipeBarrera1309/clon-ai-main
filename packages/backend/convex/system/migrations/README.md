# Organization Data Migration Scripts

This directory contains scripts for migrating and cloning organization data in production.

## Payment Fields Migration

### Purpose
Migrates data from the old `paymentUrl` field to the new `paymentLinkUrl` field in the `restaurantConfiguration` table. This is required after the payment methods system overhaul that renamed payment-related fields.

### What Gets Migrated
- `paymentUrl` → `paymentLinkUrl` (copies the URL value to the new field name)

### Usage

#### Step 1: Preview what would be migrated (dry run)

```bash
npx convex run system/migrations/migratePaymentFields:dryRun --prod
```

This shows which organizations would be affected without making any changes.

#### Step 2: Run the migration

```bash
npx convex run system/migrations/migratePaymentFields:migratePaymentUrl --prod
```

### Safety Features
- ✅ **Non-destructive**: Does not delete the old `paymentUrl` field
- ✅ **Idempotent**: Can be run multiple times safely - skips organizations that already have `paymentLinkUrl` set
- ✅ **Validation**: Only migrates non-empty values
- ✅ **Detailed logging**: Shows exactly what was migrated, skipped, or errored

### Example Output

```
[LOG] Starting payment field migration...
[LOG] Found 3 restaurant configurations to process
[LOG] ✅ Migrated organization org_123abc: "https://pay.example.com" → paymentLinkUrl
[LOG] Skipping organization org_456def: no paymentUrl to migrate
[LOG] Skipping organization org_789ghi: paymentLinkUrl already has a value

============================================================
Migration Summary:
============================================================
Total Configurations: 3
Migrated: 1
Skipped: 2
Errors: 0
============================================================
✅ Migration completed successfully! Migrated 1 configurations, skipped 2.
```

---

## Clone Organization Data

### Purpose
Copies all configuration and menu data from one organization to another. This is useful for:
- Setting up a new organization based on an existing one
- Creating test organizations with production data
- Duplicating restaurant setups

### What Gets Cloned

The script clones the following tables:
- ✅ `agentConfiguration` - AI agent settings and prompts
- ✅ `restaurantConfiguration` - Restaurant operational settings
- ✅ `restaurantLocations` - Physical restaurant locations
- ✅ `whatsappConfigurations` - WhatsApp API configurations
- ✅ `deliveryAreas` - Delivery zones and fees
- ✅ `contacts` - Customer contact information
- ✅ `menuProductCategories` - Menu categories
- ✅ `menuProductSubcategories` - Menu subcategories
- ✅ `sizes` - Product size definitions
- ✅ `menuProducts` - Menu items
- ✅ `menuProductAvailability` - Location-specific product availability
- ✅ `promotions` - Active promotions
- ✅ `promotionItems` - Promotion items

### What Does NOT Get Cloned

The following user-specific data is intentionally excluded:
- ❌ `conversations` - Customer conversations
- ❌ `orders` - Customer orders
- ❌ `orderItems` - Order line items
- ❌ `menuProductOrderItems` - Product order associations
- ❌ `messageAttachments` - Message media files
- ❌ `electronicInvoices` - Invoice data
- ❌ `conversationScheduledFunctions` - Scheduled conversation tasks

## Usage

### Step 1: Deploy the migration scripts to production

```bash
cd packages/backend
npx convex deploy --yes
```

### Step 2: Run the cloning script

```bash
npx convex run system/migrations/cloneOrganizationData:cloneOrganization \
  '{"sourceOrgId":"org_SOURCE_ID","targetOrgId":"org_TARGET_ID"}' \
  --prod
```

**Example:**
```bash
npx convex run system/migrations/cloneOrganizationData:cloneOrganization \
  '{"sourceOrgId":"org_31cKHeP7XwOnkQ6T4uh8bZLEa6C","targetOrgId":"org_33kga1N701gMhMVHqtgZpT5v15I"}' \
  --prod
```

### Step 3: Verify the clone (optional)

```bash
npx convex run system/migrations/verifyClone:verify \
  '{"organizationId":"org_TARGET_ID"}' \
  --prod
```

## Output Example

```
[LOG] Starting organization cloning from org_31cKHeP7XwOnkQ6T4uh8bZLEa6C to org_33kga1N701gMhMVHqtgZpT5v15I
[LOG] Cloning agentConfiguration...
[LOG] Cloned 1 agentConfiguration records
[LOG] Cloning restaurantConfiguration...
[LOG] Cloned 1 restaurantConfiguration records
[LOG] Cloning restaurantLocations...
[LOG] Cloned 8 restaurantLocations records
...
[LOG] ✅ Successfully cloned organization data!
[LOG] Total records cloned: 4969
```

## Return Value

```json
{
  "success": true,
  "sourceOrgId": "org_31cKHeP7XwOnkQ6T4uh8bZLEa6C",
  "targetOrgId": "org_33kga1N701gMhMVHqtgZpT5v15I",
  "totalCloned": 4969,
  "idMappings": {
    "restaurantLocations": 8,
    "menuProductCategories": 19,
    "menuProductSubcategories": 7,
    "sizes": 6,
    "menuProducts": 511,
    "promotions": 0,
    "whatsappConfigurations": 1
  }
}
```

## Important Notes

1. **Foreign Key Integrity**: The script maintains all foreign key relationships by mapping old IDs to new IDs.

2. **Idempotency**: Running the script multiple times will create duplicate data in the target organization. Make sure the target organization is empty or prepared for duplicate data.

3. **Performance**: For large organizations with thousands of products, the script may take several minutes to complete.

4. **Production vs Development**: 
   - Use `--prod` flag for production deployment
   - Omit the flag for development deployment
   - Always deploy first with `npx convex deploy --yes` when targeting production

5. **Validation**: After cloning, verify that:
   - All menu products are available
   - Delivery areas are correctly mapped to locations
   - WhatsApp configurations reference correct locations
   - Promotions reference correct products

6. **Security**: This is an internal mutation and can only be executed by authenticated administrators via the Convex CLI or Dashboard.

## Quick Reference

### Clone to Production
```bash
# 1. Deploy
cd packages/backend
npx convex deploy --yes

# 2. Clone
npx convex run system/migrations/cloneOrganizationData:cloneOrganization \
  '{"sourceOrgId":"org_SOURCE","targetOrgId":"org_TARGET"}' \
  --prod

# 3. Verify (optional)
npx convex run system/migrations/verifyClone:verify \
  '{"organizationId":"org_TARGET"}' \
  --prod
```

### Clone to Development
```bash
npx convex run system/migrations/cloneOrganizationData:cloneOrganization \
  '{"sourceOrgId":"org_SOURCE","targetOrgId":"org_TARGET"}'
```

## Troubleshooting

**Problem**: `Could not find function` error
- **Solution**: Run `npx convex deploy --yes` first to deploy the migration scripts

**Problem**: Script fails with "Not found" errors
- **Solution**: Verify both source and target organization IDs exist and are spelled correctly

**Problem**: Some products are missing after cloning
- **Solution**: Check that all menu product categories were cloned successfully. Products depend on categories being cloned first.

**Problem**: Delivery areas are not showing up
- **Solution**: Verify that restaurant locations were cloned first, as delivery areas depend on them.
