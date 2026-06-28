Feature: Assertion errors

  @expectDiff
  Scenario: An assertion error carries showDiff, expected and actual
    Given a value of 42
    Then the value should be 43
