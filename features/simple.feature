Feature: Simple scenarios

  Scenario: Without steps


  Scenario: A single passing step
    Given a value of 42
    Then the value should be 42

  Scenario: Multiple steps in sequence
    Given a value of 10
    When I double it
    Then the value should be 20

  Scenario: Chained operations
    Given a value of 3
    When I double it
    And I add 1
    Then the value should be 7
