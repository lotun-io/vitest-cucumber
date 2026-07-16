Feature: Hook lifecycle

  Scenario: Before runs once per scenario
    Then the hook count should be 1

  Scenario: Hook receives the pickle
    Then the scenario name should be "Hook receives the pickle"

  Scenario: Step hooks run around each step
    Given a value of 7
    Then the beforeStep count should be 2
    And the afterStep count should be 2

  @tagOne
  @tagTwo
  Scenario: A tag-expression hook runs when both tags match
    Then the tag-expression hook ran

  @tagOne
  Scenario: A tag-expression hook is skipped when only one tag matches
    Then the tag-expression hook did not run
