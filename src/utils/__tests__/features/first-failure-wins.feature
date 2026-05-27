Feature: First failure wins

    Scenario: First step fails and subsequent steps are skipped
        Given a failing step
        When I double it
        Then the value should be 0
