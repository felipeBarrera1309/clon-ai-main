# Tasks: Bulk Messaging System

**Linear Issues**: [LIG-7](https://linear.app/lighthouse-projects/issue/LIG-7) (Parent), [LIG-25](https://linear.app/lighthouse-projects/issue/LIG-25) (Remaining)
**Priority**: HIGH
**Status**: Core functionality complete, enhancements pending

## 1. Schema & Backend ✅

- [x] 1.1 Create `messageCampaigns` table schema
- [x] 1.2 Create `messageTemplates` table schema
- [x] 1.3 Create `campaignRecipients` table schema
- [x] 1.4 Create `create` mutation for campaigns
- [x] 1.5 Create `list` query for campaigns with filters
- [x] 1.6 Create `send` mutation to trigger campaign execution
- [x] 1.7 Create `schedule` mutation for scheduled campaigns
- [x] 1.8 Create internal action for batch message sending with rate limiting

## 2. WhatsApp Integration ✅

- [x] 2.1 Create `sendBulkMessages` function with rate limiting
- [x] 2.2 Implement webhook handler for delivery status updates
- [x] 2.3 Add retry logic for failed messages
- [x] 2.4 Track message delivery status per recipient

## 3. Dashboard UI - Templates ✅

- [x] 3.1 Create `modules/dashboard/bulk-messaging/` module structure
- [x] 3.2 Create template list view with CRUD operations
- [x] 3.3 Create template editor with variable placeholders
- [x] 3.4 Add template preview functionality

## 4. Dashboard UI - Campaigns ✅

- [x] 4.1 Create campaign list view with status indicators
- [x] 4.2 Create campaign creation wizard
- [x] 4.3 Create recipient filter builder
- [x] 4.4 Create campaign detail view with delivery analytics
- [x] 4.5 Add campaign scheduling with date/time picker

## 5. Analytics & Reporting ✅ (Partial)

- [x] 5.1 Create campaign analytics dashboard (sent, delivered, failed, read rates)
- [ ] 5.2 Add export functionality for campaign results (DEFERRED)
- [x] 5.3 Create recipient-level delivery status view (in campaign detail page with filters)

## 6. Navigation & Integration ✅

- [x] 6.1 Add "Mensajería Masiva" to dashboard sidebar
- [x] 6.2 Create route `/bulk-messaging` with sub-routes
- [x] 6.3 Add appropriate permissions/guards

## 7. Campaign System Enhancements [LIG-25] - **PARTIAL**

- [x] 7.1 Create campaign history view with filtering (main campaigns list has status/date filters)
- [ ] 7.2 Add campaign duplication functionality (DEFERRED)
- [x] 7.3 Implement campaign draft status (`draft` status in schema and UI)
- [x] 7.4 Add campaign cancellation for scheduled campaigns (`cancelMutation` in message-campaigns-view.tsx)
- [ ] 7.5 Create campaign performance comparison view (DEFERRED)

## 8. Testing & Validation ✅

- [x] 8.1 Verify schema changes compile without errors
- [x] 8.2 Test campaign creation and sending flow
- [x] 8.3 Verify rate limiting works correctly
- [x] 8.4 Verify LSP diagnostics clean
- [x] 8.5 Run `openspec validate add-bulk-messaging --strict`

---

## Deferred Enhancements (Future Work)

The following items are deferred for a future iteration:

- [ ] 5.2 Export campaign results to CSV/Excel
- [ ] 7.2 Duplicate campaign functionality
- [ ] 7.5 Campaign performance comparison/A-B testing view
