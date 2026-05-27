Feature: Hooks

    Scenario: Without tag - value starts at 0
        When I add 5
        Then the value should be 5

    @preset-10
    Scenario: With @preset-10 tag - Before hook sets value to 10
        When I add 5
        Then the value should be 15
