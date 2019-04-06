Feature: Delete an object
  I want to delete objects

  Background:
    Given our own server runs at "http://localhost:4123"
    And we have the following users in our database:
      | Slug          |
      | bernd-das-brot|
    And I send a POST request with the following activity to "/users/bernd-das-brot/inbox":
    """
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "id": "https://aronda.org/api/users/bernd-das-brot/status/lka7dfzkjn2398hsfd",
      "type": "Create",
      "actor": "https://aronda.org/api/users/bernd-das-brot",
      "object": {
          "id": "https://aronda.org/api/users/bernd-das-brot/status/kljsdfg9843jknsdf234",
          "type": "Article",
          "published": "2019-02-07T19:37:55.002Z",
          "attributedTo": "https://aronda.org/api/users/bernd-das-brot",
          "content": "Hi Max, how are you?",
          "to": "https://www.w3.org/ns/activitystreams#Public"
      }
    }
    """

  Scenario: Deleting a post (Article Object)
    When I send a POST request with the following activity to "/users/bernd-das-brot/inbox":
    """
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "id": "http://localhost:4123/api/users/karl-heinz/status/a4DJ2afdg323v32641vna42lkj685kasd2",
      "type": "Delete",
      "object": {
        "id": "https://aronda.org/api/users/bernd-das-brot/status/kljsdfg9843jknsdf234",
        "type": "Article",
        "published": "2019-02-07T19:37:55.002Z",
        "attributedTo": "https://aronda.org/api/users/bernd-das-brot",
        "content": "Hi Max, how are you?",
        "to": "https://www.w3.org/ns/activitystreams#Public"
      }
    }
    """
    Then I expect the status code to be 200
    And the object is removed from the outbox collection of "bernd-das-brot"
    """
    {
      "id": "https://aronda.org/api/users/bernd-das-brot/status/kljsdfg9843jknsdf234",
      "type": "Article",
      "published": "2019-02-07T19:37:55.002Z",
      "attributedTo": "https://aronda.org/api/users/bernd-das-brot",
      "content": "Hi Max, how are you?",
      "to": "https://www.w3.org/ns/activitystreams#Public"
    }
    """
