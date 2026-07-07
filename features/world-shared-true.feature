Feature: Shared project world parameters

    # Untagged: catches multi-project config leaks that tag filtering would mask.
    Scenario: Shared world parameter is set
        Then the world parameter shared should be "true"
