import { beginCell, toNano } from '@ton/core';
import { DIDRegistry } from '../build/Registry/Registry_DIDRegistry';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    console.log('🔨 Deploying DID Registry contract...');
    console.log('📍 Network:', provider.network());

    try {
        // Create contract instance
        const didRegistry = provider.open(await DIDRegistry.fromInit());

        // Deploy the contract
        console.log('🚀 Deploying DID Registry to network...');

        await provider.deploy(didRegistry, toNano('0.1'));

        await provider.waitForDeploy(didRegistry.address, 20, 1000);

        const contractAddress = didRegistry.address;
        console.log('✅ DID Registry deployed successfully!');
        console.log('📄 Contract address:', contractAddress.toString());

    } catch (error) {
        console.error('❌ Deployment failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}