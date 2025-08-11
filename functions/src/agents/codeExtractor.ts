// functions/src/agents/codeExtractor.ts
import { Firestore } from '@google-cloud/firestore';
import { OpenAI } from 'openai';
import { getApiKeys } from '../config/apiKeys';
import { MessageRouter } from '../core/messageRouter';
import { Logger } from '../utils/logger';

export class CodeExtractor {
    private openai: OpenAI;

    constructor(
        private db: Firestore,
        private messageRouter: MessageRouter,
        private logger: Logger
    ) {
        const apiKeys = getApiKeys();
        this.openai = new OpenAI({ apiKey: apiKeys.openai });
        this.initialize();
    }

    private initialize() {
        this.logger.info('Initializing Code Extractor');
        this.setupMessageHandlers();
    }

    private setupMessageHandlers() {
        this.messageRouter.on('CODE_EXTRACTION_REQUEST', async (message) => {
            await this.handleExtractionRequest(message.payload);
        });
    }

    private async handleExtractionRequest(payload: any) {
        const { target, context, requester } = payload;

        this.logger.info(`Code extraction requested for ${target}`);

        // Request targeted scan from repository scanner crew
        const scanResult = await this.requestTargetedScan(target);

        // Extract and analyze code
        const extraction = await this.extractCode(scanResult, context);

        // Pass to Edit Coordinator
        await this.messageRouter.sendMessage({
            type: 'CODE_EXTRACTED',
            source: 'code_extractor',
            target: 'edit_coordinator',
            payload: {
                extraction,
                context,
                requester
            },
            priority: 2,
            timestamp: Date.now()
        });
    }

    private async requestTargetedScan(target: any): Promise<any> {
        return new Promise((resolve) => {
            // Set up one-time listener for scan result
            const handler = (message: any) => {
                if (message.type === 'SCAN_RESULT') {
                    this.messageRouter.off('SCAN_RESULT', handler);
                    resolve(message.payload);
                }
            };

            this.messageRouter.on('SCAN_RESULT', handler);

            // Request scan
            this.messageRouter.sendMessage({
                type: 'TARGETED_SCAN',
                source: 'code_extractor',
                target: 'repository_scanner_manager',
                payload: {
                    target,
                    reason: 'code_extraction',
                    requester: 'code_extractor'
                },
                priority: 2,
                timestamp: Date.now()
            });
        });
    }

    private async extractCode(scanResult: any, context: any) {
        const prompt = `
    Extract and analyze relevant code sections:
    
    Target: ${JSON.stringify(context.target)}
    Purpose: ${context.purpose}
    
    Scan Results:
    ${JSON.stringify(scanResult, null, 2)}
    
    Extract:
    1. Core implementation
    2. Dependencies
    3. Related functions
    4. Configuration
    5. Tests if available
    
    Analyze:
    1. Current implementation quality
    2. Potential issues
    3. Optimization opportunities
    4. Refactoring suggestions
    
    Return as JSON with extracted code and analysis.`;

        const response = await this.openai.chat.completions.create({
            model: 'gpt-5-nano',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 2000
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response content received from OpenAI');
        }
        return JSON.parse(content);
    }
}
