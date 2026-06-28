Feature: Background steps are shared across scenarios

    Background:
        Given a value of 10

    Scenario: Background sets up initial state
        Then the value should be 10

    Scenario: Steps after background can modify the value
        When I double it
        Then the value should be 20

    Scenario: Multiple steps after background
        When I add 5
        Then the value should be 15
