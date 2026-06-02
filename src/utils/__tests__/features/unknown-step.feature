Feature: Unknown step

  Scenario: First step is undefined
    Given an unknown step
    And a value of 42
    Then the value should be 42

  Scenario: Last step is undefined
    Given a value of 42
    And the value should be 42
    Then an unknown step


