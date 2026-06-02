Feature: Show diff

    Scenario: Assertion error carries showDiff
        Given object is:
            """
            {
                "name": "John",
                "age": 30
            }
            """
        Then object should contain:
            """
            {
                "name": "Jane"
            }
            """
