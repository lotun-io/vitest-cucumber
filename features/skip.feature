Feature: Skip tag

    Scenario: A passing scenario runs normally
        Given a value of 5
        Then the value should be 5

    @skip
    Scenario: A skipped scenario is not executed
        Given a value of 99
        Then the value should be 0

    @skip
    Scenario: Another skipped scenario
        Given a value of 1
        When I double it
        Then the value should be 999

    @skip
    Scenario Outline: Skipped outline
        Given a value of <n>
        Then the value should be 0

        Examples:
            | n  |
            | 10 |
            | 20 |

    Rule: Skipped rule scenarios

        @skip
        Scenario: A skipped scenario inside a rule
            Given a value of 100
            Then the value should be 0
