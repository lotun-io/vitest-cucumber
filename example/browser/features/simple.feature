Feature: Browser mode rendering

  Scenario: Render markup into the page
    Given I render "<h1>Hello from Cucumber</h1>"
    Then the page should contain the text "Hello from Cucumber"
