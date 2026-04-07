# ClonAI Development Priorities

## Overview

This document defines the development priority order for ClonAI features based on Linear issue priorities. Use this as the authoritative source for what to work on next.

## Priority Legend

| Priority | Value | Description |
|----------|-------|-------------|
| 🔴 Urgent | 1 | Critical - immediate action required |
| 🟠 High | 2 | High priority - work on these first |
| 🟡 Medium | 3 | Medium priority - after high priority complete |
| 🟢 Low | 4 | Low priority - future roadmap |

---

## 🟠 HIGH PRIORITY - Work These First

### 1. Export Contacts [LIG-167] ✅ COMPLETE
**OpenSpec**: `add-contact-export`
**Status**: Implemented
**Effort**: Small (1-2 days)
**Why**: Bug fix - contacts can be imported but not exported. Quick win.

### 2. Dynamic Follow-up Messages [LIG-166]
**OpenSpec**: `add-followup-messages-config`
**Status**: Backlog
**Effort**: Medium (3-5 days)
**Why**: Customer-requested feature. Each client needs custom follow-up sequences.

### 3. Guided Onboarding v1 [LIG-11]
**OpenSpec**: `add-guided-onboarding`
**Status**: Backlog
**Effort**: Large (2-3 weeks)
**Sub-issues**: LIG-43, LIG-44, LIG-45, LIG-46, LIG-47, LIG-48, LIG-49
**Why**: **STAR FEATURE** - Critical for SaaS conversion. Enables autonomous client setup.

### 4. Campaigns System [LIG-25]
**OpenSpec**: `add-bulk-messaging` (remaining tasks)
**Status**: Backlog
**Effort**: Medium (3-5 days)
**Why**: Part of bulk messaging feature. Campaign scheduling and history needed.

---

## 🟡 MEDIUM PRIORITY - After High Priority

### 5. Order Auto-Status [LIG-89]
**OpenSpec**: `add-order-auto-status`
**Status**: Backlog
**Why**: Automatic status changes based on delivery type.

### 6. Product Packaging [LIG-87]
**OpenSpec**: `add-product-packaging`
**Status**: Backlog
**Why**: New product property for packaging info.

### 7. Payment Gateway [LIG-10]
**OpenSpec**: `add-payment-gateway`
**Status**: Backlog
**Sub-issues**: LIG-37, LIG-38, LIG-39, LIG-40, LIG-41, LIG-42
**Why**: Wompi/Epayco integration for online payments.

### 8. Order Printing [LIG-9]
**OpenSpec**: `add-order-printing`
**Status**: Backlog
**Sub-issues**: LIG-33, LIG-34, LIG-35, LIG-36
**Why**: Kitchen ticket printing system.

### 9. CRM Chat Agent [LIG-8]
**OpenSpec**: `add-crm-chat-agent`
**Status**: Backlog
**Sub-issues**: LIG-27, LIG-28, LIG-29, LIG-30, LIG-31, LIG-32
**Why**: Dashboard chat bubble for business queries.

### 10. Digital Catalog [LIG-12]
**OpenSpec**: `add-digital-catalog`
**Status**: Backlog
**Sub-issues**: LIG-50, LIG-51, LIG-52
**Why**: Auto-generated web catalog from menu.

### 11. WhatsApp Catalog Integration [LIG-165]
**Status**: Backlog
**Why**: Integration with WhatsApp native catalog.

### 12. Browser Notifications [LIG-163]
**Status**: Backlog
**Why**: Real-time browser notifications for new orders.

---

## 🟢 LOW PRIORITY - Future Roadmap

### 13. Schedule Validation [LIG-88]
**OpenSpec**: `add-schedule-validation`
**Status**: Backlog
**Why**: Hourly validation by location and delivery type.

### 14. Voice Calls Module [LIG-13]
**OpenSpec**: `add-voice-calls`
**Status**: Backlog
**Sub-issues**: LIG-53, LIG-54, LIG-55
**Why**: Phone order taking (future expansion).

### 15. Multi-Sector Expansion [LIG-14]
**OpenSpec**: `add-multi-sector-expansion`
**Status**: Backlog
**Sub-issues**: LIG-56, LIG-57
**Why**: Adapt platform for non-restaurant businesses.

---

## Recommended Development Order

1. ~~**LIG-167** - Export Contacts~~ ✅ COMPLETE
2. **LIG-166** - Dynamic Follow-ups (customer request, 3-5 days) ← **NEXT**
3. **LIG-25** - Campaigns System (complete bulk messaging, 3-5 days)
4. **LIG-11** - Guided Onboarding (star feature, 2-3 weeks)

After these HIGH priority items, proceed to MEDIUM priority in order listed.

---

*Last updated: 2026-01-21*
*Source: Linear ClonAI Project*
