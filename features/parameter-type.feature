Feature: Custom parameter types

    Scenario: Custom parameter type
        Then the point should be 1,2

    Scenario: String-regexp parameter type with options
        Then the color green maps to "GREEN"

    Scenario: Array-regexp parameter type with the default transformer
        Then the apple matches verbatim as "apple"
