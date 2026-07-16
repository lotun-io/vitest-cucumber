Feature: Rules

  Rule: Basic arithmetic

    Scenario: Addition
      Given a value of 5
      When I add 3
      Then the value should be 8

    Scenario: Doubling
      Given a value of 4
      When I double it
      Then the value should be 8

  Rule: Combined operations

    Scenario: Double then add
      Given a value of 6
      When I double it
      And I add 2
      Then the value should be 14

  Rule: Scenario outlines

    Scenario Outline: Doubling <input>
      Given a value of <input>
      When I double it
      Then the value should be <output>

      Examples:
        | input | output |
        | 3     | 6      |
        | 5     | 10     |
        | 7     | 14     |
