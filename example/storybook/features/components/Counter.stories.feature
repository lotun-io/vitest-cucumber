Feature: Counter

  Scenario: Increment three times
    When I click increment 3 times
    Then the count should be 3

  Scenario: Reset after increment
    When I click increment 2 times
    And I click reset
    Then the count should be 0
