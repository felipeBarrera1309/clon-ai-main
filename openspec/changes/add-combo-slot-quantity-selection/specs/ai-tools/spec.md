## ADDED Requirements

### Requirement: Combo Slot Quantity-Aware Validation
The AI combo tools SHALL support quantity-aware slot selections and repeated options within the same slot.

#### Scenario: Validate repeated option selections in a slot
- **WHEN** a customer selects options for a combo slot with `maxSelections > 1`
- **AND** the same option is selected multiple times via `quantity`
- **THEN** `validateComboSelectionsTool` SHALL validate using `sum(quantity)` for that slot
- **AND** the tool SHALL include `quantity` in the validated output
- **AND** the resolved combo price SHALL include `upcharge * quantity`

#### Scenario: Backward compatibility for legacy selections
- **WHEN** combo selections are provided without `quantity`
- **THEN** the tool SHALL treat each selection as `quantity = 1`
- **AND** validation SHALL remain successful if slot constraints are met

#### Scenario: Slot resolution priority
- **WHEN** combo selections include both `slotId` and `slotName`
- **THEN** the tool SHALL resolve slots by `slotId` first
- **AND** fallback to `slotName` when `slotId` is absent
