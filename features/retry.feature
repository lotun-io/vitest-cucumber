Feature: Retry

    @retry
    Scenario: A flaky step passes on retry
        Given a flaky step that passes on the second attempt
