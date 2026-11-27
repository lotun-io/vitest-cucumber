Feature: Form
  Gherkin's data in a story's steps: a table fills the form, a doc string its notes, and `{role}` is
  a parameter type of our own (`features/steps/form.ts`). The story (`Form.stories.ts`) spies on its
  `onSubmit`: the last step checks what the form gave it.

  Background:
    Given the stories of "./Form.stories.ts"
    And the "default" story

  Scenario: Filling the form
    When I fill in the form with:
      | Name  | Ada Lovelace    |
      | Email | ada@example.com |
    And I write the notes:
      """
      Wrote the first program,
      for the Analytical Engine.
      """
    And I choose the admin role
    And I submit the form
    Then the form was submitted with:
      | name  | Ada Lovelace    |
      | email | ada@example.com |
      | role  | admin           |
    And I see the text "Thanks, Ada Lovelace!"
