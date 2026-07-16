Feature: Bridge harness

  Scenario: Steps and hooks
    Given a value of 5
    Then the value should be 5
    And an attachment is recorded
    And the following rows:
      | a | b |
      | 1 | 2 |

  Scenario: A custom parameter type
    Then the doubled 3 is 6

  Scenario: A callback-interface step
    Given a callback step
