Feature: Test-run hooks

  Scenario: BeforeAll runs once for the whole feature
    Then BeforeAll should have run 1 time
