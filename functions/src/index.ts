// functions/src/index.ts
import * as admin from 'firebase-admin';
import { admin as adminEndpoints } from './api/adminEndpoints';
import { chat } from './api/chatEndpoints';
import { github } from './api/githubEndpoints';
import { simpleUsers } from './api/simpleUsers';
import { socket } from './api/socketEndpoint';
import { testCors } from './api/testCors';
import { test } from './api/testEndpoint';
import { users } from './api/userEndpoints';
import { webhooks } from './api/webhooks';

// Import callable functions
import { generateEditSuggestions, getAgentStatus, orchestrateRoadmap, requestDecisionSupport, trackProgress, triggerRepositoryScan } from './api/agentCallableFunctions';
import { createProject, getAllProjects, getChatHistory, getCommunicationMetrics, getProject, getRoadmap, sendMessage, updateProjectGitHub } from './api/chatCallableFunctions';
import { connectGitHub, syncProjectWithGitHub, verifyGitHub } from './api/githubCallableFunctions';
import { getUser, getUsers, loginUser, registerUser, updateUser, userDeparture } from './api/userCallableFunctions';

// Initialize Firebase Admin
admin.initializeApp();

// Export all HTTP functions
export {
    adminEndpoints as admin, chat, github, simpleUsers, socket, test, testCors, users, webhooks
};

// Export callable functions
export { connectGitHub, createProject, generateEditSuggestions, getAgentStatus, getAllProjects, getChatHistory, getCommunicationMetrics, getProject, getRoadmap, getUser, getUsers, loginUser, orchestrateRoadmap, registerUser, requestDecisionSupport, sendMessage, syncProjectWithGitHub, trackProgress, triggerRepositoryScan, updateProjectGitHub, updateUser, userDeparture, verifyGitHub };

// Agent configuration
export { AGENT_CONFIG } from './config/agents.config';

