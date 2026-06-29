Feature: Step definition variants

    Scenario: Callback-interface step
        Given a deferred value of 13
        Then the world value should be 13

    Scenario: Step definition options
        Given a value of 99 with a timeout
        Then the world value should be 99

    Scenario: When and defineStep register steps
        Given a value of 4
        When the value is doubled
        And the value is incremented
        Then the world value should be 9
