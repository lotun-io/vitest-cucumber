Feature: Step outcomes

    @failMessage(Step_failed_intentionally)
    Scenario: A throwing step is reported as failed
        Given a failing step

    @failMessage(Step_failed_intentionally)
    Scenario: First failure wins and later steps are skipped
        Given a failing step
        Then the value should be 5

    @expectStatus(UNDEFINED)
    Scenario: An undefined step is reported as undefined
        Given a step with no definition

    Scenario: The cucumber version is available
        Then the cucumber version is reported
