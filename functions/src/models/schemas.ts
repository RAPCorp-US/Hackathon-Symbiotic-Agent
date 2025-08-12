// functions/src/models/schemas.ts
import * as Joi from 'joi';

export const UserSchema = Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    skills: Joi.array().items(Joi.string()).min(1).required(),
    experience: Joi.string().valid('beginner', 'intermediate', 'advanced', 'expert').required(),
    availableHours: Joi.number().min(1).max(24).required()
});

export const TaskSchema = Joi.object({
    name: Joi.string().required(),
    description: Joi.string().required(),
    skills: Joi.array().items(Joi.string()).required(),
    estimatedHours: Joi.number().min(0.5).required(),
    priority: Joi.string().valid('critical', 'high', 'medium', 'low').required()
});

export const MessageSchema = Joi.object({
    userId: Joi.string().required(),
    message: Joi.string().min(1).max(1000).required(),
    context: Joi.object().optional()
});

export const ProjectSchema = Joi.object({
    name: Joi.string().required(),
    description: Joi.string().required(),
    duration: Joi.number().min(1).max(48).required(),
    repository: Joi.string().uri().optional(),
    technologies: Joi.array().items(Joi.string()).optional()
});

export const ConfigSchema = Joi.object({
    hackathonId: Joi.string().required(),
    maxUsers: Joi.number().min(1).max(100).default(10),
    duration: Joi.number().min(1).max(48).default(8),
    aiModels: Joi.object({
        roadmapOrchestrator: Joi.string().default('gemini-2.5-pro'),
        repositoryScanner: Joi.string().default('gemini-1.5-pro'),
        userCompiler: Joi.string().default('gemini-2.5-flash'),
        progressCoordinator: Joi.string().default('claude-4-sonnet'),
        decisionEngine: Joi.string().default('o4-mini'),
        codeExtractor: Joi.string().default('gpt-5-nano'),
        editCoordinator: Joi.string().default('claude-4-sonnet')
    }).optional(),
    features: Joi.object({
        superAnalysis: Joi.boolean().default(false),
        realtimeChat: Joi.boolean().default(true),
        autoScaling: Joi.boolean().default(true),
        budgetLimit: Joi.number().min(1).default(100)
    }).optional()
});
