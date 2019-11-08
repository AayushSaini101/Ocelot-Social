import {
  throwErrorIfApolloErrorOccurred,
  extractIdFromActivityId,
  extractNameFromId,
  constructIdFromName,
} from './utils'
import { createOrderedCollection, createOrderedCollectionPage } from './utils/collection'
import { createArticleObject, isPublicAddressed } from './utils/activity'
import gql from 'graphql-tag'
import { createHttpLink } from 'apollo-link-http'
import { setContext } from 'apollo-link-context'
import { InMemoryCache } from 'apollo-cache-inmemory'
import { ApolloClient } from 'apollo-client'
import fetch from 'node-fetch'
import trunc from 'trunc-html'
import { getDriver } from '../bootstrap/neo4j'
import uuid from 'uuid/v4'
import encode from '../jwt/encode'

const debug = require('debug')('ea:nitro-datasource')

export default NitroDataSource

function NitroDataSource(uri) {
  this.uri = uri
  const driver = getDriver()
  let token
  const defaultOptions = {
    query: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all',
    },
  }
  const link = createHttpLink({ uri: this.uri, fetch: fetch }) // eslint-disable-line
  const cache = new InMemoryCache()
  const authLink = setContext(async (_, { headers }) => {
    // return the headers to the context so httpLink can read them
    return {
      headers: {
        ...headers,
        Authorization: token ? `Bearer ${token}` : '',
      },
    }
  })

  this.client = new ApolloClient({
    link: authLink.concat(link),
    cache: cache,
    defaultOptions,
  })

  this.setToken = async function(actorId) {
    if (!actorId) {
      token = null
      return
    }
    const splitted = actorId.split('/')
    const slug = splitted.length === 1 ? actorId : extractNameFromId(actorId)
    const session = driver.session()
    const result = await session
      .run('MATCH (u:User) WHERE u.slug = { slug } RETURN u', { slug: slug })
      .catch(() => {
        session.close()
        token = null
      })
    session.close()
    if (result.records.length === 0) {
      token = null
      return
    }
    const user = result.records[0].get('u').properties
    token = encode(user)
  }

  this.getFollowersCollection = async actorId => {
    const slug = extractNameFromId(actorId)
    debug(`slug= ${slug}`)
    const result = await this.client.query({
      query: gql`
          query {
              User(slug: "${slug}") {
                  followedByCount
              }
          }
      `,
    })
    debug('successfully fetched followers')
    debug(result.data)
    if (result.data) {
      const actor = result.data.User[0]
      const followersCount = actor.followedByCount

      const followersCollection = createOrderedCollection(slug, 'followers')
      followersCollection.totalItems = followersCount

      return followersCollection
    } else {
      throwErrorIfApolloErrorOccurred(result)
    }
  }

  this.getFollowersCollectionPage = async actorId => {
    const slug = extractNameFromId(actorId)
    debug(`getFollowersPage slug = ${slug}`)
    const result = await this.client.query({
      query: gql`
          query {
              User(slug:"${slug}") {
                  followedBy {
                      slug
                  }
                  followedByCount
              }
          }
      `,
    })

    debug(result.data)
    if (result.data) {
      const actor = result.data.User[0]
      const followers = actor.followedBy
      const followersCount = actor.followedByCount

      const followersCollection = createOrderedCollectionPage(slug, 'followers')
      followersCollection.totalItems = followersCount
      debug(`followers = ${JSON.stringify(followers, null, 2)}`)
      await Promise.all(
        followers.map(async follower => {
          followersCollection.orderedItems.push(constructIdFromName(follower.slug))
        }),
      )

      return followersCollection
    } else {
      throwErrorIfApolloErrorOccurred(result)
    }
  }

  this.getFollowingCollection = async actorId => {
    const slug = extractNameFromId(actorId)
    const result = await this.client.query({
      query: gql`
          query {
              User(slug:"${slug}") {
                  followingCount
              }
          }
      `,
    })

    debug(result.data)
    if (result.data) {
      const actor = result.data.User[0]
      const followingCount = actor.followingCount

      const followingCollection = createOrderedCollection(slug, 'following')
      followingCollection.totalItems = followingCount

      return followingCollection
    } else {
      throwErrorIfApolloErrorOccurred(result)
    }
  }

  this.getFollowingCollectionPage = async actorId => {
    const slug = extractNameFromId(actorId)
    const result = await this.client.query({
      query: gql`
          query {
              User(slug:"${slug}") {
                  following {
                      slug
                  }
                  followingCount
              }
          }
      `,
    })

    debug(result.data)
    if (result.data) {
      const actor = result.data.User[0]
      const following = actor.following
      const followingCount = actor.followingCount

      const followingCollection = createOrderedCollectionPage(slug, 'following')
      followingCollection.totalItems = followingCount

      await Promise.all(
        following.map(async user => {
          followingCollection.orderedItems.push(await constructIdFromName(user.slug))
        }),
      )

      return followingCollection
    } else {
      throwErrorIfApolloErrorOccurred(result)
    }
  }

  this.getOutboxCollection = async actorId => {
    const slug = extractNameFromId(actorId)
    const result = await this.client.query({
      query: gql`
          query {
              User(slug:"${slug}") {
                  contributions {
                      slug
                  }
              }
          }
      `,
    })

    debug(result.data)
    if (result.data) {
      const actor = result.data.User[0]
      const posts = actor.contributions

      const outboxCollection = createOrderedCollection(slug, 'outbox')
      outboxCollection.totalItems = posts.length

      return outboxCollection
    } else {
      throwErrorIfApolloErrorOccurred(result)
    }
  }

  this.getOutboxCollectionPage = async actorId => {
    const slug = extractNameFromId(actorId)
    debug(`inside getting outbox collection page => ${slug}`)
    const result = await this.client.query({
      query: gql`
          query {
              User(slug:"${slug}") {
                  actorId
                  slug
                  contributions {
                      id
                      activityId
                      objectId
                      title
                      slug
                      content
                      contentExcerpt
                      createdAt
                      updatedAt
                  }
              }
          }
      `,
    })

    debug(result.data)
    if (result.data) {
      const actor = result.data.User[0]
      const posts = actor.contributions

      const outboxCollection = createOrderedCollectionPage(slug, 'outbox')
      outboxCollection.totalItems = posts.length
      await Promise.all(
        posts.map(async post => {
          outboxCollection.orderedItems.push(
            await createArticleObject(
              post.activityId,
              post.objectId,
              post.content,
              actor.actorId,
              post.id,
              post.createdAt,
              post.updatedAt,
            ),
          )
        }),
      )

      debug('after createNote')
      return outboxCollection
    } else {
      throwErrorIfApolloErrorOccurred(result)
    }
  }

  this.undoFollowActivity = async (fromActorId, toActorId) => {
    await ensureUser(fromActorId)
    const toUserId = await ensureUser(toActorId)
    await this.setToken(fromActorId)
    const result = await this.client.mutate({
      mutation: gql`
          mutation {
              unfollowUser(id: "${toUserId}") {
                  slug
              }
          }
      `,
    })
    debug(`undoFollowActivity result = ${JSON.stringify(result, null, 2)}`)
    throwErrorIfApolloErrorOccurred(result)
  }

  this.saveFollowingCollectionPage = async (followingCollection, onlyNewestItem = true) => {
    debug('inside saveFollowers')
    let orderedItems = followingCollection.orderedItems
    await ensureUser(followingCollection.id)
    await this.setToken(followingCollection.id)
    orderedItems = onlyNewestItem ? [orderedItems.pop()] : orderedItems
    return Promise.all(
      orderedItems.map(async following => {
        debug(`follower = ${following}`)
        const toUserId = await ensureUser(following)
        const result = await this.client.mutate({
          mutation: gql`
            mutation {
              followUser(id: "${toUserId}") {
                id  
              }
            }
          `,
        })

        throwErrorIfApolloErrorOccurred(result)
        debug('saveFollowing: added follow edge successfully')
      }),
    )
  }

  this.createPost = async activity => {
    await ensureUser(activity.actor)
    await this.setToken(activity.actor)
    // TODO how to handle the to field? Now the post is just created, doesn't matter who is the recipient
    // createPost
    const postObject = activity.object
    if (!isPublicAddressed(postObject)) {
      return debug(
        'createPost: not send to public (sending to specific persons is not implemented yet)',
      )
    }
    const title = postObject.summary
      ? postObject.summary
      : postObject.content
          .split(' ')
          .slice(0, 5)
          .join(' ')
    const postId = extractIdFromActivityId(postObject.id)
    debug('inside create post')
    /* eslint-disable */
    const result = await this.client.mutate({
      mutation: gql`
        mutation {
            CreatePost(content: "${postObject.content}", contentExcerpt: "${trunc(postObject.content, 120)}",  
            title: "${title}", id: "${postId}", categoryIds: ["cat16"], activityId: "${activity.id}", objectId: "${postObject.id}") {
                id
            }
        }
    `,
    })

    /* eslint-enable */

    throwErrorIfApolloErrorOccurred(result)
  }

  this.deletePost = async activity => {
    await this.setToken(activity.actor)
    const postId = extractIdFromActivityId(activity.object.id)
    const result = await this.client.mutate({
      mutation: gql`
          mutation {
              DeletePost(id: "${postId}") {
                  title
              }
          }
      `,
    })
    throwErrorIfApolloErrorOccurred(result)
  }

  this.updatePost = async activity => {
    await this.setToken(activity.actor)
    const postObject = activity.object
    const postId = extractIdFromActivityId(postObject.id)
    const title = postObject.summary
      ? postObject.summary
      : postObject.content
          .split(' ')
          .slice(0, 5)
          .join(' ')
    const contentExcerpt = trunc(postObject.content, 120).html
    const result = await this.client.mutate({
      mutation: gql`
          mutation {
              UpdatePost(content: "${postObject.content}", contentExcerpt: "${contentExcerpt}", 
              id: "${postId}", title: "${title}") {
                  title
              }
          }
      `,
    })
    throwErrorIfApolloErrorOccurred(result)
  }

  this.createLike = async activity => {
    await ensureUser(activity.actor)
    await this.setToken(activity.actor)
    const postId = extractIdFromActivityId(activity.object)
    const result = await this.client.mutate({
      mutation: gql`
          mutation {
            shout(id: "${postId}", type: Post)
          }
      `,
    })
    throwErrorIfApolloErrorOccurred(result)
    if (!result.data.shout) {
      debug('something went wrong shouting post')
      return Promise.reject(Error('User or Post not exists'))
    }
  }

  this.deleteLike = async activity => {
    await this.setToken(activity.actor)
    const postId = extractIdFromActivityId(activity.object.object)
    const result = await this.client.mutate({
      mutation: gql`
          mutation {
            unshout(id: "${postId}", type: Post)
          }
      `,
    })
    throwErrorIfApolloErrorOccurred(result)
    if (!result.data.unshout) {
      debug('something went wrong disliking a post')
      return Promise.reject(Error('User or Post not exists'))
    }
  }

  this.getSharedInboxEndpoints = async () => {
    const result = await this.client.query({
      query: gql`
        query {
          SharedInboxEndpoint {
            uri
          }
        }
      `,
    })
    throwErrorIfApolloErrorOccurred(result)
    return result.data.SharedInboxEnpoint
  }

  this.addSharedInboxEndpoint = async uri => {
    try {
      let result = await this.client.query({
        query: gql`
          query {
            SharedInboxEndpoint(uri: "${uri}") {
              id
            }
          }
        `,
      })
      throwErrorIfApolloErrorOccurred(result)
      if (result.data.SharedInboxEndpoint.length === 0) {
        result = await this.client.mutate({
          mutation: gql`
            mutation {
              CreateSharedInboxEndpoint(uri: "${uri}") {
                id
              }
            }
          `,
        })
        throwErrorIfApolloErrorOccurred(result)
      }
      return true
    } catch (e) {
      return false
    }
  }

  this.createComment = async activity => {
    const toUserId = await ensureUser(activity.actor)
    await this.setToken(activity.actor)
    const postObject = activity.object
    let result = await this.client.mutate({
      mutation: gql`
          mutation {
              CreateComment(content: "${
                postObject.content
              }", activityId: "${extractIdFromActivityId(activity.id)}") {
                  id
              }
          }
      `,
    })
    throwErrorIfApolloErrorOccurred(result)

    result = await this.client.mutate({
      mutation: gql`
          mutation {
              AddCommentAuthor(from: {id: "${result.data.CreateComment.id}"}, to: {id: "${toUserId}"}) {
                  id
              }
          }
      `,
    })
    throwErrorIfApolloErrorOccurred(result)

    const postId = extractIdFromActivityId(postObject.inReplyTo)
    result = await this.client.mutate({
      mutation: gql`
          mutation {
              AddCommentPost(from: { id: "${result.data.CreateComment.id}", to: { id: "${postId}" }}) {
                  id
              }
          }
      `,
    })

    throwErrorIfApolloErrorOccurred(result)
  }

  this.getActorId = async name => {
    const result = await this.client.query({
      query: gql`
          query {
              User(slug: "${name}") {
                  actorId
              }
          }
      `,
    })
    throwErrorIfApolloErrorOccurred(result)
    if (Array.isArray(result.data.User) && result.data.User[0]) {
      return result.data.User[0].actorId
    } else {
      return Promise.reject(Error(`No user with name: ${name}`))
    }
  }

  this.getPublicKey = async name => {
    const result = await this.client.query({
      query: gql`
          query {
              User(slug: "${name}") {
                  publicKey
              }
          }
      `,
    })
    throwErrorIfApolloErrorOccurred(result)
    if (result.data.User.length > 0) {
      return result.data.User[0].publicKey
    } else {
      return Promise.reject(Error(`No user with name: ${name}`))
    }
  }

  this.getEncryptedPrivateKey = async name => {
    const session = driver.session()
    const result = await session
      .run('MATCH (u:User) WHERE u.slug = { slug } RETURN u.privateKey', { slug: name })
      .catch(() => {
        session.close()
      })
    session.close()
    if (result.records.length === 0) {
      return Promise.reject(Error(`No user with slug: ${name}`))
    } else {
      return result.records[0].get('u.privateKey')
    }
  }

  this.userExists = async name => {
    const result = await this.client.query({
      query: gql`
          query {
              User(slug: "${name}") {
                  slug
              }
          }
      `,
    })

    if (result.data.User.length > 0) {
      return true
    } else {
      return false
    }
  }

  /**
   * This function will search for user existence and will create a user
   *
   * @param actorId
   * @returns {Promise<*>}
   */
  async function ensureUser(actorId) {
    debug(`inside ensureUser = ${actorId}`)
    const session = driver.session()
    const name = extractNameFromId(actorId)
    const uniqueSlug = (actorId, name) => {
      const { hostname } = new URL(actorId)
      const localHostname = new URL(uri).hostname

      if (localHostname === hostname) {
        // Request from same instance
        return name
      } else {
        // Request form somewhere else
        return `${hostname}-${name}`
      }
    }
    let result = await session
      .run('MATCH (u:User) WHERE u.slug = { slug } RETURN u.id', {
        slug: uniqueSlug(actorId, name),
      })
      .catch(() => {
        session.close()
      })

    if (result.records.length > 0) {
      debug('ensureUser: user exists.. return id')
      session.close()
      // user already exists.. return the id
      return result.records[0].get('u.id')
    } else {
      debug('ensureUser: user not exists.. createUser')
      // user does not exist.. create it
      const slug = uniqueSlug(actorId, name)
      result = await session
        .run(
          'CREATE (u:User {slug: { slug }, id: { id }, name: { name }, actorId: { actorId }}) RETURN u',
          { slug: slug, id: uuid(), name: name, actorId: actorId },
        )
        .catch(() => {
          session.close()
          return Promise.reject(Error('Error creating a user'))
        })
    }

    session.close()
    return result.records[0].get('u').properties.id
  }

  return this
}
