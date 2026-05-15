name: Pull Request
description: Submit a pull request
body:
  - type: markdown
    attributes:
      value: |
        Thank you for your contribution. Please fill in the information below.

  - type: dropdown
    id: type
    attributes:
      label: Change Type
      description: What kind of change does this PR introduce?
      options:
        - Bug Fix
        - New Feature
        - Enhancement
        - Refactoring
        - Documentation
        - Performance Improvement
        - Dependency Update
        - Other
    validations:
      required: true

  - type: textarea
    id: description
    attributes:
      label: Description
      description: Summarize the changes and the problem they solve
      placeholder: This PR fixes...
    validations:
      required: true

  - type: textarea
    id: motivation
    attributes:
      label: Motivation and Context
      description: Why is this change needed? What context does it address?
      placeholder: Link to any related issues, discussions, or context here
    validations:
      required: true

  - type: textarea
    id: testing
    attributes:
      label: Testing
      description: How has this been tested? Include steps to reproduce if applicable
      placeholder: |
        - [ ] Added unit tests
        - [ ] Manually tested the following scenarios:
          1. ...
          2. ...
    validations:
      required: true

  - type: checkboxes
    id: checklist
    attributes:
      label: Checklist
      description: Ensure the following before submitting
      options:
        - label: My code follows the project's code style
          required: true
        - label: I have performed a self-review of my code
          required: true
        - label: I have commented my code, particularly in hard-to-understand areas
          required: false
        - label: I have updated the documentation accordingly
          required: false
        - label: My changes generate no new warnings
          required: true
        - label: I have added tests that prove my fix is effective or that my feature works
          required: false
        - label: New and existing unit tests pass locally with my changes
          required: true

  - type: textarea
    id: screenshots
    attributes:
      label: Screenshots
      description: If applicable, add screenshots to help explain your changes

  - type: input
    id: issue
    attributes:
      label: Related Issue
      description: Link to the issue this PR addresses (if applicable)
      placeholder: "Closes #123"
