Feature: Browser interactions
    Scenario: Open a webpage
        Given the URL "https://example.com" returns:
            """
            <!doctype html>
            <html>
                <head><title>Example Domain</title></head>
                <body><h1>Example Domain</h1></body>
            </html>
            """
        And I open the URL "https://example.com"
        Then the page title should be "Example Domain"