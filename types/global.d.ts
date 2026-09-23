declare global {
    type SignInFormData = {
        email: string;
        password: string;
    };

    type SignUpFormData = {
        fullName: string;
        email: string;
        password: string;
        country: string;
        investmentGoals: string;
        riskTolerance: string;
        preferredIndustry: string;
    };

    type CountrySelectProps = {
        name: string;
        label: string;
        control: Control;
        error?: FieldError;
        required?: boolean;
    };

    type FormInputProps = {
        name: string;
        label: string;
        placeholder: string;
        type?: string;
        register: UseFormRegister;
        error?: FieldError;
        validation?: RegisterOptions;
        disabled?: boolean;
        value?: string;
    };

    type Option = {
        value: string;
        label: string;
    };

    type SelectFieldProps = {
        name: string;
        label: string;
        placeholder: string;
        options: readonly Option[];
        control: Control;
        error?: FieldError;
        required?: boolean;
    };

    type FooterLinkProps = {
        text: string;
        linkText: string;
        href: string;
    };

    type SearchCommandProps = {
        renderAs?: 'button' | 'text';
        label?: string;
        initialStocks: StockWithWatchlistStatus[];
    };

    type WelcomeEmailData = {
        email: string;
        name: string;
        intro: string;
    };

    type NewsSummaryEmailData = {
        email: string;
        date: string;
        newsContent: string;
    };

    type User = {
        id: string;
        name: string;
        email: string;
    };

    type Stock = {
        symbol: string;
        name: string;
        exchange: string;
        type: string;
    };

    type StockWithWatchlistStatus = Stock & {
        isInWatchlist: boolean;
    };

    type FinnhubSearchResult = {
        symbol: string;
        description: string;
        displaySymbol?: string;
        type: string;
    };

    type FinnhubSearchResponse = {
        count: number;
        result: FinnhubSearchResult[];
    };

    type StockDetailsPageProps = {
        params: Promise<{
            symbol: string;
        }>;
    };

    type WatchlistButtonProps = {
        symbol: string;
        company: string;
        isInWatchlist: boolean;
        showTrashIcon?: boolean;
        type?: 'button' | 'icon';
        onWatchlistChange?: (symbol: string, isAdded: boolean) => void;
    };

    type QuoteData = {
        c?: number;
        dp?: number;
    };

    type ProfileData = {
        name?: string;
        marketCapitalization?: number;
    };

    type FinancialsData = {
        metric?: { [key: string]: number };
    };

    type SelectedStock = {
        symbol: string;
        company: string;
        currentPrice?: number;
    };

    type WatchlistTableProps = {
        watchlist: StockWithData[];
    };

    type StockWithData = {
        userId: string;
        symbol: string;
        company: string;
        addedAt: Date;
        currentPrice?: number;
        changePercent?: number;
        priceFormatted?: string;
        changeFormatted?: string;
        marketCap?: string;
        peRatio?: string;
    };

    type AlertsListProps = {
        alertData: Alert[] | undefined;
    };

    type MarketNewsArticle = {
        id: number;
        headline: string;
        summary: string;
        source: string;
        url: string;
        datetime: number;
        category: string;
        related: string;
        image?: string;
    };

    type WatchlistNewsProps = {
        news?: MarketNewsArticle[];
    };

    type SearchCommandProps = {
        open?: boolean;
        setOpen?: (open: boolean) => void;
        renderAs?: 'button' | 'text';
        buttonLabel?: string;
        buttonVariant?: 'primary' | 'secondary';
        className?: string;
    };

    type AlertData = {
        symbol: string;
        company: string;
        alertName: string;
        alertType: 'upper' | 'lower' | 'volume';
        threshold: string;
        frequency: 'once_per_minute' | 'once_per_hour' | 'once_per_day';
    };

    type AlertModalProps = {
        alertId?: string;
        alertData?: AlertData;
        action?: 'create' | 'update';
        open: boolean;
        setOpen: (open: boolean) => void;
        watchlistOptions?: { symbol: string; company: string }[];
    };

    type RawNewsArticle = {
        id: number;
        headline?: string;
        summary?: string;
        source?: string;
        url?: string;
        datetime?: number;
        image?: string;
        category?: string;
        related?: string;
    };

    type Alert = {
        id: string;
        symbol: string;
        company: string;
        alertName: string;
        currentPrice: number;
        alertType: 'upper' | 'lower' | 'volume';
        threshold: number;
        frequency: 'once_per_minute' | 'once_per_hour' | 'once_per_day';
        changePercent?: number;
    };

    type StockAlertEmailData = {
        email: string;
        symbol: string;
        company: string;
        currentPrice: string;
        targetPrice: string;
        timestamp: string;
        alertType: 'upper' | 'lower';
    };

    type VolumeAlertEmailData = {
        email: string;
        symbol: string;
        company: string;
        currentVolume: string;
        currentPrice: string;
        changeDirection: string;
        changePercent: string;
        priceColor: string;
        alertMessage: string;
        averageVolume: string;
        volumeSpike: string;
        timestamp: string;
    };

    type CandleSeries = {
        c?: number[];
        h?: number[];
        t?: number[];
        s?: string;
    };

    type RiskLabel = 'Low' | 'Medium' | 'High';

    type StockRiskAnalytics = {
        symbol: string;
        company: string;
        currentPrice: number;
        priceFormatted: string;
        changePercent: number;
        changeFormatted: string;
        sampleDays: number;
        annualizedVolatility: number | null;
        computedBeta: number | null;
        finnhubBeta: number | null;
        maxDrawdown: number | null;
        var95: number | null;
        cvar95: number | null;
        sharpe: number | null;
        sortino: number | null;
        distanceFrom52wHigh: number | null;
        week52High: number | null;
        riskScore: number | null;
        riskLabel: RiskLabel | null;
        summary: string;
        limited: boolean;
    };
}

export {};