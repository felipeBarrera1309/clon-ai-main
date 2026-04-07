## 1. Schema & Backend
- [ ] 1.1 Create `businessChatSessions` table schema (userId, organizationId, messages, createdAt)
- [ ] 1.2 Create `sendBusinessQuery` mutation for processing user questions
- [ ] 1.3 Create internal queries for business data aggregation (sales, orders, products, contacts)

## 2. AI Agent
- [ ] 2.1 Create `businessIntelligenceAgent` in `system/ai/agents/`
- [ ] 2.2 Create system prompt for business queries and platform support
- [ ] 2.3 Create `querySalesDataTool` - Query sales by date range, location
- [ ] 2.4 Create `queryOrdersTool` - Query orders with filters
- [ ] 2.5 Create `queryProductPerformanceTool` - Top/bottom selling products
- [ ] 2.6 Create `queryContactsTool` - Customer analytics
- [ ] 2.7 Create `platformHelpTool` - Answer platform usage questions

## 3. Dashboard UI - Chat Bubble
- [ ] 3.1 Create `ChatBubble` floating component
- [ ] 3.2 Create `ChatWindow` expandable panel
- [ ] 3.3 Create `ChatMessage` component for conversation display
- [ ] 3.4 Create `ChatInput` with send functionality
- [ ] 3.5 Add context filter selector (date range, location, data type)

## 4. Chat Features
- [ ] 4.1 Implement real-time message streaming
- [ ] 4.2 Add typing indicator while AI processes
- [ ] 4.3 Create suggested questions/quick actions
- [ ] 4.4 Add conversation history persistence
- [ ] 4.5 Implement data visualization for numeric responses (charts, tables)

## 5. Integration
- [ ] 5.1 Add chat bubble to dashboard layout (visible on all pages)
- [ ] 5.2 Ensure bubble doesn't interfere with other UI elements
- [ ] 5.3 Add minimize/maximize functionality
- [ ] 5.4 Persist chat state across page navigation

## 6. Testing & Validation
- [ ] 6.1 Verify AI agent responds correctly to business queries
- [ ] 6.2 Test data aggregation queries for accuracy
- [ ] 6.3 Verify chat UI works across different screen sizes
- [ ] 6.4 Verify linting passes on all modified files
