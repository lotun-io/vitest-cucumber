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
